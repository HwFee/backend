import glob
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional

from config.settings import settings

logger = logging.getLogger(__name__)

# Docker 预检超时（秒）：守护进程不可达时快速失败，避免拖慢 data_analyze 步骤
PREFLIGHT_TIMEOUT_SECONDS = 5

# 沙箱资源限制（与 docker run 参数一致）
DOCKER_MEMORY = "512m"
DOCKER_CPUS = "1"
DOCKER_PIDS_LIMIT = 64

# 容器内非 root 用户（与 backend/docker/code-runner.Dockerfile 一致）
DOCKER_RUN_USER = "1000:1000"

# 数据分析代码生成的图表扩展名（skills/adapters/data_analyze.py 按此识别）
CHART_EXTENSIONS = (".png", ".jpg", ".jpeg", ".svg")

# 进程内缓存：docker 守护进程是否可用。守护进程关闭时 docker CLI 每次调用都要
# 等连接超时，缓存避免每次执行都卡住；仅缓存 daemon 状态，镜像检查不缓存
# （镜像可能被重新构建）。
_docker_daemon_ok: Optional[bool] = None


class SandboxUnavailable(Exception):
    """代码执行沙箱不可用（Docker 守护进程未运行 / CLI 缺失 / 镜像不存在）。

    data_analyze 适配器捕获该异常后跳过代码执行，降级为纯文本分析，
    不会回退到宿主机执行。
    """


class DockerSandboxExecutor:
    """基于 `docker run` 的代码执行沙箱。

    隔离措施：
    - `--network none`：无网络，LLM 生成的代码无法外联
    - `--memory 512m --cpus 1 --pids-limit 64`：资源上限
    - `--read-only --tmpfs /tmp`：根文件系统只读，仅 /tmp 可写
    - 非 root 用户（uid 1000）运行
    - 每轮执行使用独立临时目录挂载到 /workspace，脚本与输出（图表）都在其中，
      执行结束后图表文件复制回宿主机进程 CWD，临时目录随即清理
    """

    def __init__(self, timeout: int = 60, image: Optional[str] = None):
        self.timeout = timeout
        self.image = image or settings.code_exec_docker_image

    def run(self, code: str) -> Dict:
        self._ensure_docker_ready()

        workdir = tempfile.mkdtemp(prefix="code-exec-")
        cid_file = os.path.join(workdir, "container.id")
        try:
            script_path = os.path.join(workdir, "main.py")
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)

            # 容器内以非 root 用户（uid 1000）写入挂载目录，需放开目录权限。
            # 这是每轮执行的独立空临时目录，权限放开无安全影响。
            try:
                os.chmod(workdir, 0o777)
            except OSError:
                pass

            argv = self._build_argv(workdir, cid_file)
            try:
                result = subprocess.run(
                    argv, capture_output=True, text=True, timeout=self.timeout
                )
            except subprocess.TimeoutExpired:
                self._kill_container(cid_file)
                return {
                    "success": False,
                    "output": "",
                    "error": f"Code execution timed out after {self.timeout}s",
                }
            except Exception as e:
                return {
                    "success": False,
                    "output": "",
                    "error": str(e),
                }

            stdout = result.stdout or ""
            stderr = result.stderr or ""

            if result.returncode != 0:
                error_msg = stderr or stdout or "Execution failed"
                return {
                    "success": False,
                    "output": "",
                    "error": error_msg.strip(),
                }

            # 把容器内生成的图表复制回宿主机进程 CWD（与旧宿主执行路径的落盘位置一致）
            self._collect_chart_files(workdir)
            return {
                "success": True,
                "output": stdout.strip(),
                "error": "",
            }
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def _build_argv(self, workdir: str, cid_file: str) -> List[str]:
        """构造 docker run 参数。workdir 使用正斜杠形式（Windows Docker 也接受）。"""
        volume = f"{workdir.replace(os.sep, '/')}:/workspace"
        return [
            "docker", "run",
            "--rm",
            "--network", "none",
            "--memory", DOCKER_MEMORY,
            "--cpus", DOCKER_CPUS,
            "--pids-limit", str(DOCKER_PIDS_LIMIT),
            "--read-only",
            "--tmpfs", "/tmp",
            "--cidfile", cid_file,
            "-v", volume,
            "-w", "/workspace",
            "-u", DOCKER_RUN_USER,
            # 只读根文件系统下，把 HOME 与 matplotlib 缓存指到 /tmp（tmpfs）
            "-e", "HOME=/tmp",
            "-e", "MPLCONFIGDIR=/tmp/mplconfig",
            "-e", "PYTHONDONTWRITEBYTECODE=1",
            "-e", "PYTHONUNBUFFERED=1",
            self.image,
            "python", "/workspace/main.py",
        ]

    def _ensure_docker_ready(self) -> None:
        """守护进程/镜像预检。守护进程状态按进程缓存；镜像检查每次执行做一次。"""
        global _docker_daemon_ok
        if _docker_daemon_ok is None:
            try:
                probe = subprocess.run(
                    ["docker", "info"],
                    capture_output=True,
                    text=True,
                    timeout=PREFLIGHT_TIMEOUT_SECONDS,
                )
                _docker_daemon_ok = probe.returncode == 0
            except (subprocess.TimeoutExpired, OSError):
                _docker_daemon_ok = False
        if not _docker_daemon_ok:
            raise SandboxUnavailable(
                "代码执行沙箱不可用：Docker 守护进程未运行（请先启动 Docker Desktop）"
            )
        try:
            inspect = subprocess.run(
                ["docker", "image", "inspect", self.image],
                capture_output=True,
                text=True,
                timeout=PREFLIGHT_TIMEOUT_SECONDS,
            )
        except (subprocess.TimeoutExpired, OSError):
            inspect = None
        if inspect is None or inspect.returncode != 0:
            raise SandboxUnavailable(
                f"代码执行沙箱不可用：镜像 {self.image} 不存在"
                "（请先构建，见 backend/README.md「如何启用代码执行沙箱」）"
            )

    def _kill_container(self, cid_file: str) -> None:
        """docker run 超时后清理容器（--rm 会在容器停止后自动移除）。"""
        try:
            with open(cid_file, encoding="utf-8") as f:
                cid = f.read().strip()
            if not cid:
                return
            subprocess.run(
                ["docker", "kill", cid],
                capture_output=True,
                text=True,
                timeout=PREFLIGHT_TIMEOUT_SECONDS,
            )
        except Exception:
            logger.exception("Failed to kill container %s", cid_file)

    def _collect_chart_files(self, workdir: str) -> None:
        """把容器 /workspace（=workdir）里生成的图表复制回宿主机进程 CWD，
        使 data_analyze 的 os.path.exists(line) 探测与旧宿主执行路径行为一致。"""
        for ext in CHART_EXTENSIONS:
            for chart in glob.glob(os.path.join(workdir, f"*{ext}")):
                try:
                    shutil.copy2(chart, os.getcwd())
                except OSError:
                    logger.warning("Failed to copy chart %s to CWD", chart)


class CodeExecutor:
    """
    LLM 生成 Python 代码的执行器。

    后端由 `settings.code_exec_backend` 控制（构造时可用 backend 参数覆盖，供测试/特殊场景）：
    - "docker"（默认）：Docker 沙箱执行（见 DockerSandboxExecutor）。
    - "host"：直接在宿主机子进程执行——**存在任意代码执行（RCE）风险**，
      仅限本地调试，生产环境严禁使用。
    - "disabled"：禁用代码执行，run() 直接返回 skipped 结果。

    daemon/镜像不可用时抛 SandboxUnavailable（不回落宿主执行），
    data_analyze 适配器捕获后降级为纯文本分析。
    """

    def __init__(self, timeout: int = 30, backend: Optional[str] = None):
        self.timeout = timeout
        self.backend = backend or settings.code_exec_backend

    def run(self, code: str) -> Dict:
        backend = self.backend
        if backend == "host":
            logger.warning(
                "!!! code_exec_backend=host：正在宿主机直接执行 LLM 生成的代码，"
                "存在任意代码执行（RCE）风险，仅限本地调试，生产环境严禁使用 !!!"
            )
            return self._run_on_host(code)
        if backend == "docker":
            return DockerSandboxExecutor(
                timeout=self.timeout, image=settings.code_exec_docker_image
            ).run(code)
        if backend != "disabled":
            logger.warning(
                "code_exec_backend=%s 未识别，按 disabled 处理（跳过代码执行）", backend
            )
        return {
            "success": False,
            "output": "",
            "error": "代码执行沙箱已禁用（code_exec_backend=disabled）",
            "skipped": True,
        }

    def _run_on_host(self, code: str) -> Dict:
        """旧宿主子进程执行路径（不安全，仅 code_exec_backend=host 时可达）。"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            wrapped_code = (
                "import sys\n"
                "from io import StringIO\n"
                "_stdout = StringIO()\n"
                "_stderr = StringIO()\n"
                "_old_stdout = sys.stdout\n"
                "_old_stderr = sys.stderr\n"
                "sys.stdout = _stdout\n"
                "sys.stderr = _stderr\n"
                f"{code}\n"
                "sys.stdout = _old_stdout\n"  # 先恢复
                "sys.stderr = _old_stderr\n"
                "print('__EXEC_RESULT__')\n"
                "print(_stdout.getvalue(), end='')\n"
                "print(_stderr.getvalue(), end='')\n"
            )
            f.write(wrapped_code)
            temp_path = f.name

        try:
            result = subprocess.run(
                ["python", temp_path],
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            stdout = result.stdout
            stderr = result.stderr

            if result.returncode != 0:
                # 提取错误信息中的有用部分
                error_msg = stderr or stdout or "Execution failed"
                # 去掉临时文件路径，避免泄露
                error_msg = error_msg.replace(temp_path, "<script>")
                return {
                    "success": False,
                    "output": "",
                    "error": error_msg,
                }

            # 提取实际输出（__EXEC_RESULT__ 之前的内容）
            if "__EXEC_RESULT__" in stdout:
                parts = stdout.split("__EXEC_RESULT__")
                actual_output = parts[0].strip() if parts else stdout.strip()
            else:
                actual_output = stdout.strip()

            return {
                "success": True,
                "output": actual_output,
                "error": "",
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "output": "",
                "error": f"Code execution timed out after {self.timeout}s",
            }
        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": str(e),
            }
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
