"""
Cliente DICOMweb para comunicación con DMCPACS (DCM4CHEE).
VPS 20 (217.216.80.205) → VPS 10 (217.216.85.0) via HTTPS.
"""
import httpx
from typing import Optional
from config import settings

DICOMWEB_RS = f"{settings.pacs_dcm4chee_url}/aets/{settings.pacs_aet}/rs"


class PACSService:
    def __init__(self):
        # verify=False: direct IP access to VPS 10 with Cloudflare Origin cert
        self.client = httpx.AsyncClient(
            timeout=30.0,
            verify=False,
            headers={"Host": "pacs.dmcprojects.cl"},
        )

    async def search_studies(
        self,
        patient_name: Optional[str] = None,
        patient_id: Optional[str] = None,
        study_date: Optional[str] = None,
        modality: Optional[str] = None,
        accession_number: Optional[str] = None,
        study_description: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        params = {"limit": limit, "offset": offset, "includefield": "all"}
        if patient_name:
            params["PatientName"] = f"*{patient_name}*"
        if patient_id:
            params["PatientID"] = patient_id
        if study_date:
            params["StudyDate"] = study_date
        if modality:
            params["ModalitiesInStudy"] = modality
        if accession_number:
            params["AccessionNumber"] = accession_number
        if study_description:
            params["StudyDescription"] = f"*{study_description}*"
        resp = await self.client.get(
            f"{DICOMWEB_RS}/studies",
            params=params,
            headers={"Accept": "application/dicom+json"},
        )
        if resp.status_code == 204:
            return []
        resp.raise_for_status()
        return resp.json()

    async def get_study_metadata(self, study_uid: str) -> dict:
        resp = await self.client.get(
            f"{DICOMWEB_RS}/studies/{study_uid}/metadata",
            headers={"Accept": "application/dicom+json"},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_study_series(self, study_uid: str) -> list[dict]:
        resp = await self.client.get(
            f"{DICOMWEB_RS}/studies/{study_uid}/series",
            headers={"Accept": "application/dicom+json"},
        )
        if resp.status_code == 204:
            return []
        resp.raise_for_status()
        return resp.json()

    async def get_series_instances(self, study_uid: str, series_uid: str) -> list[dict]:
        """List all instances (metadata, not pixels) for a series via DICOMweb."""
        resp = await self.client.get(
            f"{DICOMWEB_RS}/studies/{study_uid}/series/{series_uid}/instances",
            headers={"Accept": "application/dicom+json"},
        )
        if resp.status_code == 204:
            return []
        resp.raise_for_status()
        return resp.json()

    async def get_instance_frames(self, study_uid: str, series_uid: str, instance_uid: str) -> bytes:
        """Download DICOM instance via WADO-RS."""
        resp = await self.client.get(
            f"{DICOMWEB_RS}/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}",
            headers={"Accept": "application/dicom"},
        )
        resp.raise_for_status()
        return resp.content

    async def get_worklist(self, modality: Optional[str] = None) -> list[dict]:
        params = {"includefield": "all"}
        if modality:
            params["Modality"] = modality
        resp = await self.client.get(
            f"{settings.pacs_dcm4chee_url}/aets/{settings.pacs_aet}/rs/mwlitems",
            params=params,
            headers={"Accept": "application/dicom+json"},
        )
        if resp.status_code == 204:
            return []
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _val(tag_data: dict, default="") -> str:
        if not tag_data:
            return default
        value = tag_data.get("Value", [default])
        if isinstance(value, list) and len(value) > 0:
            v = value[0]
            if isinstance(v, dict):
                return v.get("Alphabetic", str(v))
            return str(v)
        return default

    def format_study(self, raw: dict) -> dict:
        v = self._val
        uid = v(raw.get("0020000D"))
        return {
            "study_instance_uid": uid,
            "study_date": v(raw.get("00080020")),
            "study_time": v(raw.get("00080030")),
            "accession_number": v(raw.get("00080050")),
            "modalities": v(raw.get("00080061")),
            "study_description": v(raw.get("00081030")),
            "patient_name": v(raw.get("00100010")),
            "patient_id": v(raw.get("00100020")),
            "patient_birth_date": v(raw.get("00100030")),
            "patient_sex": v(raw.get("00100040")),
            "study_id": v(raw.get("00200010")),
            "num_series": v(raw.get("00201206"), "0"),
            "num_instances": v(raw.get("00201208"), "0"),
            "viewer_url": f"{settings.ohif_viewer_url}/viewer?StudyInstanceUIDs={uid}",
        }

    async def close(self):
        await self.client.aclose()


pacs_service = PACSService()
