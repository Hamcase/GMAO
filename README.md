# GMAO - Intelligent Maintenance Management Platform

## Overview
This project implements an intelligent GMAO (Computerized Maintenance Management System) platform that integrates advanced AI and machine learning technologies for predictive maintenance, failure analysis, and spare parts forecasting. The system combines a Next.js 15 frontend with a Python FastAPI backend to deliver RAG-based chatbot assistance, AMDEC automated analysis, and time-series forecasting models (Prophet, ARIMA, LSTM) for industrial maintenance optimization.

- **Purpose**: Automate maintenance management with AI-driven insights, predictive analytics, and intelligent decision support to reduce downtime and optimize operational efficiency.
- **Target Audience**: Maintenance engineers, industrial managers, data scientists, and organizations seeking to modernize their maintenance operations with AI.
- **Date**: Created in January 2026.

## Project Structure
The project consists of a monorepo architecture with clear separation between frontend, backend, and shared components:

### Frontend Architecture
1. **`apps/web/`**: Main Next.js 15 application with Turbopack
   - **`app/home/insights/`**: Analytics dashboard with KPIs, skill gap detection, and workload alerts
   - **`app/home/chat/`**: RAG-based chatbot with ChromaDB vector search and OCR document processing
   - **`app/home/pdr/`**: Spare parts forecasting module with ML models (Prophet, ARIMA, LSTM)
   - **`app/home/amdec/`**: Automated AMDEC analysis with criticality scoring and visualizations

2. **`packages/`**: Shared libraries and components
   - **`packages/shared/src/localdb/`**: IndexedDB schema with Dexie.js for offline-first architecture
   - **`packages/ui/`**: Shadcn UI components library
   - **`packages/supabase/`**: Supabase client and authentication utilities

### Backend Architecture
3. **`backend/main.py`**: FastAPI server with REST endpoints
   - **`rag/`**: RAG pipeline with ChromaDB, LangChain, and OCR processing
   - **`scripts/forecast_pdr.py`**: ML forecasting models (Prophet, ARIMA, LSTM) with MTBF enhancement
   - **`chroma_db/`**: Vector database storage for semantic search

## Installation

### Prerequisites
- **Node.js** 18.18.0 or higher (latest LTS recommended)
- **Python** 3.11 or higher
- **PNPM** 10.18.2 or higher
- **Docker Desktop** (required for Supabase local instance)
- **Git**
- **Tesseract OCR** (for document processing):
  - Windows: Download from [UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki)
  - macOS: `brew install tesseract`
  - Linux: `sudo apt install tesseract-ocr`

### Dependencies

#### Frontend Installation
```bash
# Clone the repository
git clone https://github.com/Hamcase/GMAO.git
cd GMAO

# Install dependencies
pnpm install

# Start Supabase local instance (Docker must be running)
pnpm supabase:web:start

# Generate TypeScript types from Supabase schema
pnpm supabase:web:typegen
```

#### Backend Installation
```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate
# macOS/Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Download spaCy model (required for NLP)
python -m spacy download en_core_web_sm
```

Create a `requirements.txt` file in the `backend/` directory with the following content:
```
fastapi==0.115.12
uvicorn[standard]==0.34.2
python-multipart==0.0.28
pydantic==2.12.2
pandas==2.2.3
numpy==2.2.6
prophet==1.1.6
statsmodels==0.14.6
tensorflow==2.18.1
tf-keras==2.18.1
scikit-learn==1.6.2
langchain==0.3.31
langchain-community==0.3.31
chromadb==0.5.31
openai==1.59.8
pytesseract==0.3.14
easyocr==1.7.3
pdf2image==1.18.3
PyMuPDF==1.25.6
supabase==2.11.2
python-dotenv==1.0.1
```

### API Keys
The platform requires several API keys for full functionality:

#### Required Keys:
1. **OpenAI API Key** (for RAG embeddings and chatbot):
   - Obtain from [OpenAI Platform](https://platform.openai.com/)
   - Create `backend/.env` file:
     ```env
     OPENAI_API_KEY=sk-your-openai-key-here
     ```

2. **Supabase Keys** (for authentication and database):
   - Local development uses default keys from `pnpm supabase:web:start`
   - For production, obtain from [Supabase Dashboard](https://supabase.com/)
   - Create `apps/web/.env.local` file:
     ```env
     NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
     NEXT_PUBLIC_SITE_URL=http://localhost:3000
     ```

#### Optional Keys:
3. **Backend Supabase Service Key** (for sync features):
   ```env
   # In backend/.env
   SUPABASE_URL=http://localhost:54321
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```

## Usage

### Workflow
Follow these steps to run the complete platform:

1. **Start Supabase Local Instance**:
   ```bash
   # From project root
   pnpm supabase:web:start
   ```
   - Wait for Supabase to initialize (Docker containers will start)
   - Note the `anon key` and `service_role key` displayed in terminal
   - Supabase Studio accessible at: http://localhost:54323

2. **Start Frontend Development Server**:
   ```bash
   # From project root
   pnpm dev
   ```
   - Frontend will be available at: http://localhost:3000
   - Hot reload enabled with Turbopack for fast development

3. **Start Backend API Server**:
   ```bash
   # In a new terminal
   cd backend
   .\.venv\Scripts\Activate  # Windows
   # source .venv/bin/activate  # macOS/Linux
   python main.py
   ```
   - Backend API available at: http://localhost:8000
   - Interactive API docs at: http://localhost:8000/docs

4. **Import Initial Data**:
   - Navigate to http://localhost:3000
   - Create an account (stored in local Supabase)
   - Go to "Data Import" section
   - Upload the `gmao_integrator.xlsx` file (contains sample maintenance data)
   - Data is stored in IndexedDB for offline-first functionality

### Detailed Instructions

#### Module 1: Dashboard Insights & Analytics
- **Purpose**: Provides comprehensive KPIs and intelligent analytics for maintenance operations.
- **Functionality**:
  - Displays technician performance metrics (success rate, total repairs, hours worked)
  - Machine health analysis with risk scoring and failure predictions
  - Advanced analytics: skill gap detection, workload alerts, and performance correlations
  - Interactive tooltips explaining KPI calculations, thresholds, and interpretations
- **Key Features**:
  - Month-by-month filtering to avoid large cumulative values
  - Real-time KPI calculations from IndexedDB
  - Recharts visualizations (bar charts, pie charts, radar plots)
  - Color-coded risk levels and status indicators
- **Usage**:
  - Navigate to "Insights & Analytics" after data import
  - Use month filter to analyze specific periods
  - Hover over info icons (ℹ️) next to KPIs for detailed explanations
  - Click on technician cards to see specializations and training needs
  - Review machine risk scores and AI failure predictions

#### Module 2: RAG-Based Chatbot with Document Search
- **Purpose**: Intelligent assistant for technical documentation and maintenance queries.
- **Functionality**:
  - Upload PDF/Excel documents to build a knowledge base
  - OCR processing with Tesseract for scanned documents
  - Semantic search using ChromaDB vector embeddings (OpenAI text-embedding-ada-002)
  - Citation-aware responses with source highlighting in PDFs
  - Context-aware conversation with chat history
- **Key Features**:
  - Automatic document chunking (configurable chunk size and overlap)
  - Reranking for improved retrieval accuracy
  - PDF viewer with automatic scrolling to cited sections
  - Supports multiple document formats (PDF, CSV, Excel)
- **Usage**:
  - Navigate to "Chatbot" section
  - Upload technical documents (maintenance manuals, procedures, etc.)
  - Wait for OCR processing and embedding generation
  - Ask questions in natural language (e.g., "Comment réparer une pompe hydraulique?")
  - Click on citations to view source documents with highlighted text
- **Customization**:
  - Adjust chunk size in `backend/rag/chunking.py` (line 45)
  - Modify OpenAI model in `backend/rag/chroma_manager.py` (line 28)

#### Module 3: Spare Parts Forecasting (PDR)
- **Purpose**: Predict future spare parts consumption using advanced time-series models.
- **Functionality**:
  - Three ML models available:
    - **Prophet** (Facebook): Handles seasonality and trend with multiplicative components
    - **ARIMA/SARIMA**: Statistical models for complex patterns
    - **LSTM** (TensorFlow): Deep learning for non-linear dependencies
  - MTBF (Mean Time Between Failures) enhancement for reliability-based blending
  - Comprehensive evaluation metrics: MAE, RMSE, R², SMAPE, Hit Rate, Directional Accuracy
  - Configurable horizon (1-24 months) and safety factor (1.0-3.0x)
- **Key Features**:
  - Adaptive model blending based on R² performance
  - Outlier detection and capping for data stability
  - Historical vs. predicted visualization with confidence intervals
  - Export forecasts and configurations to IndexedDB
- **Usage**:
  - Navigate to "Prévision PDR" (Spare Parts Forecasting)
  - Select a machine and part reference from dropdowns
  - Choose forecasting model (Prophet recommended for most cases)
  - Set horizon (default: 12 months) and safety factor (default: 1.2x)
  - Enable/disable MTBF enhancement
  - Click "Lancer la prévision" and wait for training (6-30 seconds depending on model)
  - Review metrics and visualizations
  - Export results to CSV or continue experimenting
- **Demo Mode** (hardcoded for presentations):
  - Machine: `machine1`, Part: `M-CAB0021`, Model: `prophet`, Horizon: `6`, Safety: `1.2`
  - Generates realistic metrics in 6-7 seconds without actual training
- **Customization**:
  - Adjust Prophet hyperparameters in `backend/scripts/forecast_pdr.py` (lines 235-265)
  - Modify LSTM architecture in `forecast_pdr.py` (lines 535-555)
  - Change MTBF blending weights in `forecast_pdr.py` (lines 825-840)

#### Module 4: AMDEC Analysis (Failure Mode Analysis)
- **Purpose**: Automated AMDEC (FMECA) analysis with criticality scoring and risk prioritization.
- **Functionality**:
  - Import AMDEC data from CSV files (French column names supported)
  - Automatic column mapping with intelligent detection
  - NPR (Risk Priority Number) calculation: Severity × Occurrence × Detection
  - Frequency and cost-based economic analysis
  - Visual dashboards with distribution charts and NPR matrices
- **Key Features**:
  - Interactive table with inline editing capabilities
  - Filter by machine, component, or severity level
  - Pareto charts for failure mode prioritization
  - Export to CSV or Excel with calculated metrics
- **Usage**:
  - Navigate to "AMDEC" section
  - Import CSV file with columns: machine, component, failure_mode, severity, occurrence, detection
  - Review automatic NPR calculations
  - Use visualizations to identify high-risk failure modes
  - Edit values inline if needed
  - Export enhanced analysis with recommendations
- **Customization**:
  - Modify column mapping in data import logic
  - Adjust NPR thresholds for risk categories (line 180 in amdec page)

## Output

### Dashboard Insights
- **On-screen**: 
  - 5 main KPI cards (Total Technicians, Success Rate, Total Repairs, Total Spend, At-Risk Machines)
  - Technician performance cards with specializations and training needs
  - Machine health cards with risk scores and AI predictions
  - Advanced analytics charts (skill gaps, workload alerts, correlations)
- **Exportable**: Screenshots and data can be saved for reporting

### RAG Chatbot
- **On-screen**:
  - Conversational interface with message history
  - PDF viewer with source highlighting
  - Citation links to specific document pages
- **Storage**: 
  - Uploaded documents stored in `backend/pdf_storage/`
  - Vector embeddings in `backend/chroma_db/`
  - Chat history in IndexedDB

### PDR Forecasting
- **On-screen**:
  - Metrics dashboard (MAE, RMSE, R², SMAPE, Hit Rate, etc.)
  - Line chart showing historical data vs. predictions
  - Confidence intervals (lower/upper bounds)
  - MTBF blending information
- **Downloadable**:
  - `forecast_results_[timestamp].csv`: Detailed forecasts with metadata
  - `historical_data.csv`: Training data used for model
- **Storage**: Forecasts saved to IndexedDB (`forecastResults` table)

### AMDEC Analysis
- **On-screen**:
  - Interactive table with NPR calculations
  - Pareto chart of failure modes
  - Distribution charts (severity, occurrence, detection)
  - NPR matrix heatmap
- **Downloadable**:
  - `amdec_analysis_[timestamp].csv`: Complete analysis with NPR
  - `amdec_analysis_[timestamp].xlsx`: Excel format with formatting

## Troubleshooting

### Frontend Issues
- **"pnpm not found"**: Install PNPM globally with `npm install -g pnpm@10.18.2`
- **Supabase start fails**: 
  - Ensure Docker Desktop is running
  - Check ports 54321 (API), 54323 (Studio) are not in use
  - Run `pnpm supabase:web:stop` then restart
- **Build errors**: 
  - Clear Turbo cache: `rm -rf .turbo`
  - Delete `node_modules` and reinstall: `pnpm install`
- **TypeScript errors**: Run `pnpm supabase:web:typegen` to regenerate types

### Backend Issues
- **"Module not found"**: Verify virtual environment is activated and run `pip install -r requirements.txt`
- **OpenAI API errors**: 
  - Check API key is valid in `backend/.env`
  - Verify billing is enabled on OpenAI account
  - Check rate limits haven't been exceeded
- **ChromaDB errors**: Delete `backend/chroma_db/` folder and restart (embeddings will regenerate)
- **OCR failures**: 
  - Verify Tesseract is installed: `tesseract --version`
  - Check PDF quality (scanned documents may need higher DPI)
  - Install additional language packs if needed

### Data Issues
- **Import fails**: 
  - Verify file format (CSV/Excel) and encoding (UTF-8 recommended)
  - Check column names match expected format
  - Review browser console for detailed error messages
- **Forecasting errors**:
  - Ensure minimum 6 months of historical data
  - Check for duplicate month entries
  - Verify quantities are non-negative numbers
- **Large datasets**: 
  - IndexedDB has ~50MB-1GB limit depending on browser
  - Use month filters to reduce data volume
  - Consider aggregating older data

### Performance Issues
- **Slow forecasting**: 
  - LSTM models can take 30-60 seconds for large datasets
  - Use Prophet for faster results
  - Reduce training data volume if possible
- **Dashboard lag**: 
  - Apply month filter to reduce calculated data
  - Clear browser cache and IndexedDB
  - Check for memory leaks in browser dev tools

### Logs and Debugging
- **Frontend**: Open browser DevTools (F12) → Console tab
- **Backend**: Check terminal output where `python main.py` is running
- **Supabase**: View logs at http://localhost:54323 → Logs section

## Academic Relevance

### Innovation and Research Contributions
- **Predictive Maintenance**: Implements state-of-the-art time-series forecasting (Prophet, ARIMA, LSTM) for industrial maintenance, advancing the field of predictive analytics in manufacturing.
- **RAG Architecture**: Demonstrates practical application of Retrieval-Augmented Generation with vector databases, contributing to knowledge management research in industrial contexts.
- **Offline-First Design**: Showcases IndexedDB-based architecture for edge computing scenarios, relevant to IIoT (Industrial Internet of Things) and Industry 4.0 research.
- **MTBF-Enhanced Forecasting**: Novel approach blending statistical reliability analysis (MTBF) with ML predictions, bridging traditional maintenance engineering and modern AI.

### Data Science and Machine Learning
- **Multi-Model Comparison**: Provides empirical framework for evaluating Prophet, ARIMA, and LSTM on intermittent demand forecasting, addressing sparse data challenges common in industrial settings.
- **Hybrid Forecasting**: Adaptive model blending based on R² performance metrics demonstrates ensemble learning principles applied to maintenance data.
- **Metric Innovation**: Introduction of domain-specific metrics (Hit Rate, Directional Accuracy) tailored to maintenance forecasting beyond standard MAE/RMSE.

### Human-Computer Interaction
- **Explainable AI**: Tooltip-based KPI explanations (calculation, interpretation, thresholds) enhance transparency and user trust in AI-driven decisions.
- **Visual Analytics**: Interactive dashboards with Recharts provide intuitive understanding of complex maintenance data, supporting decision-making processes.

### Interdisciplinary Impact
- **Industrial Engineering**: Bridges gap between theoretical GMAO systems and practical AI implementation with real-world data constraints.
- **Software Engineering**: Demonstrates modern full-stack architecture (Next.js + FastAPI) with monorepo organization (Turborepo) suitable for enterprise applications.
- **Operations Research**: AMDEC automation and criticality analysis contribute to risk management and quality assurance methodologies.

### Publication Potential
- Results and methodologies can be published in journals focusing on:
  - Industrial maintenance and reliability engineering
  - Machine learning applications in manufacturing
  - Human-computer interaction for industrial systems
  - Smart manufacturing and Industry 4.0 technologies

## Future Improvements

### Short-Term Enhancements
- **PWA Implementation**: Add Service Workers for complete offline functionality with asset caching
- **Real-time Notifications**: WebSocket integration for live maintenance alerts and updates
- **Mobile Responsiveness**: Optimize UI for tablet and smartphone usage in field operations
- **Export Templates**: Customizable report generation with company branding

### Medium-Term Features
- **IoT Integration**: Connect sensors for real-time equipment monitoring and automatic failure detection
- **Advanced ML Models**: 
  - Transformer-based models (e.g., TFT) for multivariate forecasting
  - Anomaly detection using autoencoders
  - Classification models for failure type prediction
- **Scheduling Optimization**: Automated maintenance planning with constraint satisfaction algorithms
- **Multi-Tenancy**: Support for multiple organizations with isolated data and user management

### Long-Term Vision
- **Mobile Native App**: React Native application for iOS/Android with offline sync
- **Edge Computing**: Deploy lightweight models on edge devices for low-latency predictions
- **Augmented Reality**: AR overlays for equipment repair guidance using ChatGPT Vision API
- **Digital Twin Integration**: 3D modeling and simulation of equipment states
- **Blockchain Traceability**: Immutable maintenance records for compliance and auditing

### Research Directions
- **Transfer Learning**: Pre-trained models for cross-equipment failure prediction
- **Causal Inference**: Identify root causes of failures beyond correlation analysis
- **Reinforcement Learning**: Optimal maintenance scheduling under uncertainty
- **Federated Learning**: Privacy-preserving model training across multiple facilities

## Contributors
- **Developed by**: Amcassou Hanane & Benakka Zaid
- **Academic Supervision**: ENSAM (École Nationale Supérieure d'Arts et Métiers)

## License
All rights reserved. This project is developed for academic and research purposes.

---