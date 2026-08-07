from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    debug: bool = False
    allowed_hosts: str
    refresh_token_expire_days: int = 7
    access_token_expire_minutes: int = 15

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model_pro: str = "deepseek-v4-pro"
    deepseek_model_flash: str = "deepseek-v4-flash"
    redis_url: str = "redis://localhost:6379/0"

    # Search APIs
    serpapi_key: str = ""
    bing_api_key: str = ""

    # Development fallback: when True, run reports inline if Celery/Redis is unavailable
    run_reports_inline_when_celery_unavailable: bool = True

    # 附件单文件大小上限（MB）
    max_upload_file_size_mb: int = 20

    # 代码执行沙箱（data_analyze 步骤执行 LLM 生成的分析代码）
    # - "docker"（默认）: Docker 沙箱执行（网络隔离/内存/CPU/进程数限制/只读根文件系统）
    # - "host": 直接在宿主机子进程执行（任意代码执行/RCE 风险，仅限本地调试，生产严禁使用）
    # - "disabled": 禁用代码执行，data_analyze 跳过代码分析，仅做文本分析
    code_exec_backend: str = "docker"
    code_exec_docker_image: str = "report-agent-code-runner:latest"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
