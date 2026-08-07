import subprocess

import pytest

import tools.code_executor as code_executor_module
from tools.code_executor import CodeExecutor, SandboxUnavailable


class TestHostBackend:
    """宿主执行路径（code_exec_backend=host，不安全，仅显式启用时测试）。"""

    def test_simple_execution(self):
        executor = CodeExecutor(backend="host")
        result = executor.run("print(1 + 1)")
        assert result["success"] is True

    def test_execution_with_error(self):
        executor = CodeExecutor(backend="host")
        result = executor.run("1/0")
        assert result["success"] is False
        assert "error" in result

    def test_timeout(self):
        executor = CodeExecutor(timeout=1, backend="host")
        result = executor.run("import time; time.sleep(10)")
        assert result["success"] is False
        assert "timed out" in result["error"]


class TestDockerBackend:
    """Docker 沙箱后端：全部通过 mock subprocess 模拟 docker CLI，不要求真实 daemon。"""

    @pytest.fixture(autouse=True)
    def reset_daemon_cache(self, monkeypatch):
        monkeypatch.setattr(code_executor_module, "_docker_daemon_ok", None)

    @staticmethod
    def _docker_cli_ok():
        """守护进程与镜像均正常的 docker CLI 模拟。"""

        def fake_run(argv, **kwargs):
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 0, stdout="Server Version: 29.6.2", stderr="")
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")
            if argv[:2] == ["docker", "run"]:
                return subprocess.CompletedProcess(argv, 0, stdout="hello\n", stderr="")
            raise AssertionError(f"unexpected argv: {argv}")

        return fake_run

    @staticmethod
    def _flag_pair(argv, flag):
        return argv[argv.index(flag) + 1]

    def test_docker_run_argv_contains_isolation_flags(self, monkeypatch):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append(argv)
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 0, stdout="ok", stderr="")
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")
            if argv[:2] == ["docker", "run"]:
                return subprocess.CompletedProcess(argv, 0, stdout="hello", stderr="")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        executor = CodeExecutor(backend="docker", timeout=60)
        result = executor.run("print('hello')")
        assert result["success"] is True
        assert result["output"] == "hello"

        run_argv = next(a for a in calls if a[:2] == ["docker", "run"])
        assert "--rm" in run_argv
        assert self._flag_pair(run_argv, "--network") == "none"
        assert self._flag_pair(run_argv, "--memory") == "512m"
        assert self._flag_pair(run_argv, "--cpus") == "1"
        assert self._flag_pair(run_argv, "--pids-limit") == "64"
        assert "--read-only" in run_argv
        assert self._flag_pair(run_argv, "--tmpfs") == "/tmp"
        assert self._flag_pair(run_argv, "-u") == "1000:1000"
        assert self._flag_pair(run_argv, "-w") == "/workspace"
        volume = self._flag_pair(run_argv, "-v")
        assert volume.endswith(":/workspace")
        cidfile = self._flag_pair(run_argv, "--cidfile")
        assert cidfile.endswith("container.id")
        assert "report-agent-code-runner:latest" in run_argv
        assert run_argv[-2:] == ["python", "/workspace/main.py"]

    def test_daemon_down_raises_sandbox_unavailable(self, monkeypatch):
        def fake_run(argv, **kwargs):
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 1, stdout="", stderr="Cannot connect to the Docker daemon")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        executor = CodeExecutor(backend="docker")
        with pytest.raises(SandboxUnavailable):
            executor.run("print(1)")

    def test_image_missing_raises_sandbox_unavailable(self, monkeypatch):
        def fake_run(argv, **kwargs):
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 0, stdout="ok", stderr="")
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 1, stdout="", stderr="No such image: report-agent-code-runner:latest")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        executor = CodeExecutor(backend="docker")
        with pytest.raises(SandboxUnavailable):
            executor.run("print(1)")

    def test_docker_cli_missing_raises_sandbox_unavailable(self, monkeypatch):
        def raise_file_not_found(argv, **kwargs):
            raise FileNotFoundError("docker not found")

        monkeypatch.setattr(subprocess, "run", raise_file_not_found)
        executor = CodeExecutor(backend="docker")
        with pytest.raises(SandboxUnavailable):
            executor.run("print(1)")

    def test_execution_error_returns_error_dict(self, monkeypatch):
        def fake_run(argv, **kwargs):
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 0, stdout="ok", stderr="")
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")
            if argv[:2] == ["docker", "run"]:
                return subprocess.CompletedProcess(argv, 1, stdout="", stderr="ZeroDivisionError: division by zero")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        executor = CodeExecutor(backend="docker")
        result = executor.run("1/0")
        assert result["success"] is False
        assert "ZeroDivisionError" in result["error"]

    def test_timeout_kills_container(self, monkeypatch):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append(argv)
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 0, stdout="ok", stderr="")
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")
            if argv[:2] == ["docker", "run"]:
                cid_path = argv[argv.index("--cidfile") + 1]
                with open(cid_path, "w", encoding="utf-8") as f:
                    f.write("container-abc123\n")
                raise subprocess.TimeoutExpired(argv, timeout=60)
            if argv[:2] == ["docker", "kill"]:
                return subprocess.CompletedProcess(argv, 0, stdout="container-abc123", stderr="")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        executor = CodeExecutor(backend="docker", timeout=5)
        result = executor.run("import time; time.sleep(100)")
        assert result["success"] is False
        assert "timed out" in result["error"]
        kill_calls = [a for a in calls if a[:2] == ["docker", "kill"]]
        assert len(kill_calls) == 1
        assert kill_calls[0][2] == "container-abc123"

    def test_daemon_check_cached_per_process(self, monkeypatch):
        calls = []

        def fake_run(argv, **kwargs):
            calls.append(argv)
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")
            if argv[:2] == ["docker", "run"]:
                return subprocess.CompletedProcess(argv, 0, stdout="ok\n", stderr="")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        monkeypatch.setattr(code_executor_module, "_docker_daemon_ok", True)  # 预置缓存：daemon 已探测过
        executor = CodeExecutor(backend="docker")
        assert executor.run("print(1)")["success"] is True
        assert executor.run("print(2)")["success"] is True
        info_calls = [a for a in calls if a[:2] == ["docker", "info"]]
        assert info_calls == []  # 缓存命中，不再探测 daemon


class TestDisabledBackend:
    def test_disabled_skips_execution(self):
        executor = CodeExecutor(backend="disabled")
        result = executor.run("print('x')")
        assert result["success"] is False
        assert result["skipped"] is True
        assert "禁用" in result["error"]

    def test_unknown_backend_treated_as_disabled(self):
        executor = CodeExecutor(backend="fancy")
        result = executor.run("print('x')")
        assert result["success"] is False
        assert result["skipped"] is True
