from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    anthropic_api_key: str
    database_url: str
    redis_url: str = "redis://localhost:6379"
    mirth_url: str = "http://mirth-vm:8443/api"
    whisper_url: str = "http://whisper-vm:8001"
    fhir_server_url: str = "http://fhir-vm:8080/fhir"
    # PACS / Orthanc (opcional — para consultar imágenes por AccessionNumber)
    orthanc_url: str = ""
    orthanc_user: str = "orthanc"
    orthanc_password: str = "orthanc"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 480
    jwt_refresh_ttl_days: int = 7
    cors_origins: List[str] = ["http://localhost:3020"]
    pdf_output_dir: str = "./pdf_storage"
    app_env: str = "development"
    integration_token: str = ""          # Token para endpoint /worklist/integration (vacío = sin auth)
    # PACS DCM4CHEE (VPS 10)
    pacs_dcm4chee_url: str = ""
    pacs_aet: str = "DMCPACS"
    ohif_viewer_url: str = ""
    # InformIA DICOM analysis
    informia_dicom_analysis: bool = False
    informia_max_tokens: int = 2000
    informia_default_temperatura: float = 0.3
    informia_few_shot_max: int = 5

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
