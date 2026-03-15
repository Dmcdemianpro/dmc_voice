"""
Backfill script: link existing Worklist entries to their Reports.

Tries two matching strategies:
  1. worklist.accession_number = reports.accession_number
  2. worklist.id::text = reports.study_id  (cuando el frontend pasó worklist.id como study_id)

Run from the backend root:
    python3 scripts/backfill_worklist_report_id.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import AsyncSessionLocal


# Match by accession_number
BY_ACCESSION = text("""
UPDATE worklist w
SET report_id = r.id
FROM reports r
WHERE w.accession_number = r.accession_number
  AND w.accession_number IS NOT NULL
  AND w.report_id IS NULL
""")

# Match by worklist.id = reports.study_id
# (frontend passes item.id as study_id when item.study_id is null)
BY_STUDY_ID = text("""
UPDATE worklist w
SET report_id = r.id
FROM reports r
WHERE r.study_id = w.id::text
  AND r.study_id IS NOT NULL
  AND w.report_id IS NULL
""")

# Also mark worklist status = INFORMADO for signed/sent reports that are now linked
SYNC_STATUS = text("""
UPDATE worklist w
SET status = CASE
    WHEN r.status = 'ENVIADO'  THEN 'ENVIADO'
    WHEN r.status = 'FIRMADO'  THEN 'INFORMADO'
    ELSE w.status
END
FROM reports r
WHERE w.report_id = r.id
  AND r.status IN ('FIRMADO', 'ENVIADO')
  AND w.status = 'PENDIENTE'
""")

SUMMARY_SQL = text("""
SELECT
    COUNT(*) FILTER (WHERE report_id IS NOT NULL) AS linked,
    COUNT(*) FILTER (WHERE report_id IS NULL)     AS unlinked,
    COUNT(*) FILTER (WHERE status = 'INFORMADO')  AS informado,
    COUNT(*) FILTER (WHERE status = 'ENVIADO')    AS enviado,
    COUNT(*) FILTER (WHERE status = 'PENDIENTE')  AS pendiente
FROM worklist
""")


async def run():
    async with AsyncSessionLocal() as db:
        # Strategy 1: by accession_number
        r1 = await db.execute(BY_ACCESSION)
        print(f"[accession_number match] {r1.rowcount} fila(s) vinculada(s)")

        # Strategy 2: by worklist.id = study_id
        r2 = await db.execute(BY_STUDY_ID)
        print(f"[study_id match]         {r2.rowcount} fila(s) vinculada(s)")

        # Sync status for newly linked entries
        r3 = await db.execute(SYNC_STATUS)
        print(f"[status sync]            {r3.rowcount} fila(s) con status actualizado")

        await db.commit()

        # Summary
        result = await db.execute(SUMMARY_SQL)
        row = result.mappings().first()
        print(f"\nResumen worklist:")
        print(f"  Con informe vinculado : {row['linked']}")
        print(f"  Sin informe           : {row['unlinked']}")
        print(f"  PENDIENTE             : {row['pendiente']}")
        print(f"  INFORMADO             : {row['informado']}")
        print(f"  ENVIADO               : {row['enviado']}")


if __name__ == "__main__":
    asyncio.run(run())
