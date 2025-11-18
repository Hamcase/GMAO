# GMAO ETL Scripts

## Setup

1. **Create Python virtual environment** (if not already done):
```bash
cd backend
python -m venv venv
```

2. **Activate the virtual environment**:
- Windows: `.\venv\Scripts\activate`
- Linux/Mac: `source venv/bin/activate`

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

## Available Importers

### 1. Maintenance Work Orders (`import_maintenance.py`)

Import maintenance work orders from Excel/CSV into Supabase.

**Supported formats:** `.xlsx`, `.xls`, `.csv`

**Required columns:**
- `asset_code`: Equipment ID (e.g., "COMP-A1")
- `wo_code`: Work order code (e.g., "WO-2024-001")
- `start_at`: Start datetime (ISO 8601 or Excel datetime)
- `technician`: Technician name

**Optional columns:**
- `end_at`, `type` (corrective|preventive|emergency|improvement), `cause_text`, `description`, `part_sku`, `quantity`

**Usage:**
```bash
python scripts/import_maintenance.py --file data.xlsx --tenant-id <uuid>
```

---

### 2. KPI Metrics (`import_kpis.py`) 🆕

Import historical KPI metrics (MTBF, MTTR, Availability) from Excel/CSV files.

**Supported formats:** `.xlsx`, `.xls`, `.csv`

**Expected structure:**
- First column: Equipment/Asset identifiers
- Following columns: Monthly or periodic metrics (e.g., "Avril", "Mai 2024", "Q1-2024")
- Automatically detects: Availability, MTBF, MTTR metrics from column names

**Auto-detection:**
- Filenames containing `kpi`, `mtbf`, `mttr`, `dispo`, or `availability` automatically use this importer

**Usage:**
```bash
python scripts/import_kpis.py --file Dispo_MTBF_MTTR.xlsx --tenant-id <uuid>
```

**Example Excel structure:**
```
Equipment | Avril | Mai | Juin | MTBF_Avril | MTTR_Avril
COMP-A1   | 0.95  | 0.97| 0.96 | 450        | 2.5
COMP-B2   | 0.92  | 0.94| 0.93 | 380        | 3.2
```

---

### 3. AMDEC/FMEA Data (`import_amdec.py`) 🆕

Import AMDEC/FMEA failure mode analysis from CSV/Excel files.

**Supported formats:** `.xlsx`, `.xls`, `.csv`, `.json`

**Required columns:**
- `function_name`: Function/System name
- `failure_mode`: Failure mode description
- `severity` (S): 1-10
- `occurrence` (O): 1-10
- `detection` (D): 1-10

**Optional columns:**
- `cause`, `effect`, `asset_code`, `current_controls`, `recommended_actions`

**Auto-detection:**
- Filenames containing `amdec`, `fmea`, or `failure` automatically use this importer

**Usage:**
```bash
python scripts/import_amdec.py --file AMDEC.csv --tenant-id <uuid>
```

**Example CSV:**
```csv
function_name,failure_mode,cause,effect,severity,occurrence,detection
Compressor,Oil leak,Seal failure,Production loss,8,3,4
Pump,Overheating,Bearing wear,Shutdown,9,2,3
```

---

## Smart Upload API

The `/api/upload-maintenance` endpoint **automatically detects** the file type based on filename:

| Filename Pattern | Importer Used |
|------------------|---------------|
| Contains `kpi`, `mtbf`, `mttr`, `dispo`, `availability` | `import_kpis.py` |
| Contains `amdec`, `fmea`, `failure` | `import_amdec.py` |
| Default | `import_maintenance.py` |

**Supported file formats:** `.xlsx`, `.xls`, `.csv`, `.json`

---

## Environment Variables

All scripts require these environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Example

```powershell
# Windows PowerShell
$env:NEXT_PUBLIC_SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
python scripts/import_maintenance.py --file data.xlsx --tenant-id ec72697f-51d7-41ab-b5d3-00cd1acd5aa4
```

```bash
# Linux/Mac
export NEXT_PUBLIC_SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
python scripts/import_maintenance.py --file data.xlsx --tenant-id ec72697f-51d7-41ab-b5d3-00cd1acd5aa4
```

## Output

The script outputs JSON to stdout with the import results:

```json
{
  "success": true,
  "message": "Import completed successfully",
  "data": {
    "assets_created": 5,
    "technicians_created": 3,
    "work_orders_created": 120,
    "parts_used": 45
  }
}
```

Progress messages are logged to stderr for monitoring.

## Troubleshooting

### Missing dependencies
```bash
pip install pandas openpyxl supabase python-dotenv numpy
```

### Wrong importer used
Rename your file to include keywords: `kpi`, `mtbf`, `amdec`, etc.

### Column missing errors
- **Work Orders:** Check `asset_code`, `wo_code`, `start_at`, `technician`
- **KPIs:** Ensure first column has equipment names, other columns have metrics
- **AMDEC:** Check `function_name`, `failure_mode`, `severity`, `occurrence`, `detection`

### Supabase connection errors
Verify environment variables and service role key permissions.

### File format issues
- Excel: Try saving as `.xlsx` (not `.xls` or macro-enabled)
- CSV: Ensure UTF-8 encoding
- Large files: May need to increase timeout in API route
