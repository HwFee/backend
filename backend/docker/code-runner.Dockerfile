# 数据分析代码执行沙箱镜像
#
# 构建：
#   docker build -f backend/docker/code-runner.Dockerfile -t report-agent-code-runner:latest backend/docker
#
# 运行时的隔离由 tools/code_executor.py 的 docker run 参数保证：
# --network none --memory 512m --cpus 1 --pids-limit 64 --read-only --tmpfs /tmp
#
# 依赖清单与 skills/adapters/data_analyze.py 提示词中告知 LLM 的可用库保持一致
# （pandas/numpy/matplotlib/seaborn + openpyxl 用于读取 xlsx 附件）。

FROM python:3.10-slim

RUN pip install --no-cache-dir \
        pandas \
        numpy \
        matplotlib \
        seaborn \
        openpyxl

# 非 root 运行用户（uid 1000，与 code_executor.py 的 -u 1000:1000 对应）
RUN useradd --create-home --uid 1000 runner

USER runner
WORKDIR /workspace
