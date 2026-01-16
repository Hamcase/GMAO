'use client';

import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { createBrowserClient } from '@supabase/ssr';
import { 
  ArrowUpTrayIcon, 
  DocumentArrowUpIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { 
  importPDRHistory, 
  getPDRStats, 
  clearPDRHistory 
} from '@kit/shared/localdb/pdr-import';
import { db } from '@kit/shared/localdb/schema';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';


interface ImportStats {
  totalRecords: number;
  uniqueMachines: number;
  uniqueParts: number;
  dateRange: {
    start: Date;
    end: Date;
  } | null;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export default function PDRPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [activeTab, setActiveTab] = useState<'import' | 'historique' | 'prevision' | 'config'>('import');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Historique state
  const [selectedMachine, setSelectedMachine] = useState<string>('ALL');
  const [machines, setMachines] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Prévision state
  const [forecastMachine, setForecastMachine] = useState<string>('');
  const [forecastPart, setForecastPart] = useState<string>('');
  const [availableParts, setAvailableParts] = useState<any[]>([]);
  const [forecastHorizon, setForecastHorizon] = useState<number>(3);
  const [forecastModel, setForecastModel] = useState<'prophet' | 'arima' | 'sarima' | 'lstm'>('prophet');
  const [isTraining, setIsTraining] = useState(false);
  const [forecastResult, setForecastResult] = useState<any>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  // Configuration state
  const [r2Threshold, setR2Threshold] = useState<number>(0.4);
  const [activeMonthsThreshold, setActiveMonthsThreshold] = useState<number>(10);
  const [safetyStockConfidence, setSafetyStockConfidence] = useState<number>(1.65);
  const [savedForecasts, setSavedForecasts] = useState<any[]>([]);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Model Hyperparameters
  const [arimaP, setArimaP] = useState<number>(2);
  const [arimaD, setArimaD] = useState<number>(1);
  const [arimaQ, setArimaQ] = useState<number>(2);
  
  const [prophetChangepointPrior, setProphetChangepointPrior] = useState<number>(0.05);
  const [prophetSeasonalityMode, setProphetSeasonalityMode] = useState<'additive' | 'multiplicative'>('additive');
  const [prophetGrowth, setProphetGrowth] = useState<'linear' | 'logistic'>('linear');
  
  const [lstmLayers, setLstmLayers] = useState<number>(2);
  const [lstmUnits, setLstmUnits] = useState<number>(64);
  const [lstmDropout, setLstmDropout] = useState<number>(0.2);
  const [lstmEpochs, setLstmEpochs] = useState<number>(100);
  
  const [autoSeasonality, setAutoSeasonality] = useState<boolean>(true);
  const [trendDecomposition, setTrendDecomposition] = useState<boolean>(true);
  const [handleOutliers, setHandleOutliers] = useState<boolean>(true);
  const [logTransformation, setLogTransformation] = useState<boolean>(false);
  
  const [lookbackWindow, setLookbackWindow] = useState<number>(12);
  const [predictionHorizon, setPredictionHorizon] = useState<number>(12);

  // MTBF & Safety Factor
  const [useMtbf, setUseMtbf] = useState<boolean>(true);
  const [safetyFactor, setSafetyFactor] = useState<number>(1.2); // 1.2 = 20% buffer for 24/7 assumption

  // Load machines on mount
  useEffect(() => {
    loadMachines();
    loadSavedForecasts();
  }, []);

  // Load history when machine changes
  useEffect(() => {
    if (activeTab === 'historique') {
      loadHistoryData();
    }
  }, [activeTab, selectedMachine]);

  // Load parts when forecast machine changes
  useEffect(() => {
    if (forecastMachine) {
      loadPartsForMachine(forecastMachine);
    }
  }, [forecastMachine]);

  const loadMachines = async () => {
    try {
      const allRecords = await db.pdrHistory.toArray();
      console.log('📊 PDR Records found:', allRecords.length);
      console.log('📊 Sample records:', allRecords.slice(0, 3));
      
      const uniqueMachines = Array.from(new Set(allRecords.map(r => r.machine))).sort();
      console.log('🏭 Unique machines:', uniqueMachines);
      
      setMachines(uniqueMachines);
    } catch (error) {
      console.error('Error loading machines:', error);
    }
  };

  const loadHistoryData = async () => {
    setIsLoadingHistory(true);
    try {
      let records = await db.pdrHistory.toArray();
      
      if (selectedMachine !== 'ALL') {
        records = records.filter(r => r.machine === selectedMachine);
      }

      // Group by part and year
      const partYearMap: Record<string, Record<number, number>> = {};
      
      records.forEach(record => {
        const partRef = record.partReference || 'Sans pièce';
        const partName = record.partDesignation || 'Intervention sans pièce';
        const key = `${partRef}|||${partName}`;
        const year = record.interventionDate.getUTCFullYear();
        const quantity = record.partQuantity || 1; // Count as 1 intervention if no quantity
        
        if (!partYearMap[key]) {
          partYearMap[key] = {};
        }
        partYearMap[key][year] = (partYearMap[key][year] || 0) + quantity;
      });

      // Convert to array format
      const data = Object.entries(partYearMap).map(([key, years]) => {
        const [partRef, partName] = key.split('|||');
        const total = Object.values(years).reduce((sum, val) => sum + val, 0);
        return {
          partRef,
          partName,
          years,
          total,
        };
      });

      // Sort by total descending
      data.sort((a, b) => b.total - a.total);
      
      setHistoryData(data);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadTimeSeriesForPart = async (partRef: string) => {
    try {
      let records = await db.pdrHistory
        .where('partReference')
        .equals(partRef)
        .toArray();

      if (selectedMachine !== 'ALL') {
        records = records.filter(r => r.machine === selectedMachine);
      }

      // Group by month
      const monthMap: Record<string, number> = {};
      records.forEach(record => {
        const date = record.interventionDate;
        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        const quantity = record.partQuantity || 1;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + quantity;
      });

      // Convert to array and sort
      const timeSeries = Object.entries(monthMap)
        .map(([month, quantity]) => ({ month, quantity }))
        .sort((a, b) => a.month.localeCompare(b.month));

      setTimeSeriesData(timeSeries);
      setSelectedPart(partRef);
    } catch (error) {
      console.error('Error loading time series:', error);
    }
  };

  const exportToExcel = () => {
    // Create CSV content
    const years = Array.from(
      new Set(
        historyData.flatMap(row => Object.keys(row.years).map(y => parseInt(y)))
      )
    ).sort();

    const headers = ['Référence', 'Désignation', ...years.map(y => y.toString()), 'Total'];
    const rows = historyData.map(row => [
      row.partRef,
      row.partName,
      ...years.map(year => row.years[year] || 0),
      row.total,
    ]);

    const csv = [
      headers.join(';'),
      ...rows.map(row => row.join(';')),
    ].join('\n');

    // Download
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pdr_historique_${selectedMachine}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getHeatmapColor = (value: number, max: number) => {
    if (value === 0) return 'bg-gray-50 text-gray-400';
    const intensity = value / max;
    if (intensity > 0.75) return 'bg-red-500 text-white font-bold';
    if (intensity > 0.5) return 'bg-orange-500 text-white font-semibold';
    if (intensity > 0.25) return 'bg-yellow-500 text-gray-900';
    return 'bg-green-500 text-white';
  };

  const loadSavedForecasts = async () => {
    try {
      const configs = await db.forecastConfigs.toArray();
      setSavedForecasts(configs);
    } catch (error) {
      console.error('Error loading saved forecasts:', error);
    }
  };

  const saveForecastConfig = async () => {
    if (!forecastResult || !forecastMachine || !forecastPart) return;

    try {
      const config = {
        id: crypto.randomUUID(),
        machine: forecastMachine,
        partReference: forecastPart,
        model: forecastModel,
        horizon: forecastHorizon,
        metrics: forecastResult.metrics,
        strategy: forecastResult.strategy,
        trainedAt: new Date(),
        trainingDataRange: {
          start: forecastResult.historical[0]?.month || '',
          end: forecastResult.historical[forecastResult.historical.length - 1]?.month || '',
        },
        parameters: {
          r2Threshold,
          activeMonthsThreshold,
          safetyStockConfidence,
        },
      };

      await db.forecastConfigs.add(config);
      await loadSavedForecasts();
      alert('✅ Configuration sauvegardée avec succès !');
    } catch (error) {
      console.error('Error saving forecast:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  const deleteSavedForecast = async (id: string) => {
    if (!confirm('Supprimer cette configuration ?')) return;
    
    try {
      await db.forecastConfigs.delete(id);
      await loadSavedForecasts();
    } catch (error) {
      console.error('Error deleting forecast:', error);
    }
  };

  const resetHyperparameters = () => {
    setArimaP(2);
    setArimaD(1);
    setArimaQ(2);
    setProphetChangepointPrior(0.05);
    setProphetSeasonalityMode('additive');
    setProphetGrowth('linear');
    setLstmLayers(2);
    setLstmUnits(64);
    setLstmDropout(0.2);
    setLstmEpochs(100);
    setAutoSeasonality(true);
    setTrendDecomposition(true);
    setHandleOutliers(true);
    setLogTransformation(false);
    setLookbackWindow(12);
    setPredictionHorizon(12);
    setR2Threshold(0.4);
    setActiveMonthsThreshold(10);
    setSafetyStockConfidence(1.65);
    alert('✅ Paramètres réinitialisés aux valeurs par défaut');
  };

  const savePreset = () => {
    const preset = {
      arimaP,
      arimaD,
      arimaQ,
      prophetChangepointPrior,
      prophetSeasonalityMode,
      prophetGrowth,
      lstmLayers,
      lstmUnits,
      lstmDropout,
      lstmEpochs,
      autoSeasonality,
      trendDecomposition,
      handleOutliers,
      logTransformation,
      lookbackWindow,
      predictionHorizon,
      r2Threshold,
      activeMonthsThreshold,
      safetyStockConfidence,
    };
    localStorage.setItem('pdr_hyperparameters_preset', JSON.stringify(preset));
    alert('✅ Préréglage sauvegardé avec succès !');
  };

  const exportForecastsToCSV = () => {
    if (savedForecasts.length === 0) {
      alert('⚠️ Aucune prévision à exporter');
      return;
    }

    const headers = ['Machine', 'Pièce', 'Modèle', 'Stratégie', 'Horizon', 'MAE', 'MAPE', 'RMSE', 'R²', 'Date'];
    const rows = savedForecasts.map(f => [
      f.machine,
      f.partReference,
      f.model.toUpperCase(),
      f.strategy,
      `${f.horizon} mois`,
      f.metrics.mae,
      f.metrics.mape,
      f.metrics.rmse,
      f.metrics.r2,
      new Date(f.trainedAt).toLocaleDateString('fr-FR'),
    ]);

    const csv = [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `previsions_pdr_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportForecastsToExcel = () => {
    if (savedForecasts.length === 0) {
      alert('⚠️ Aucune prévision à exporter');
      return;
    }

    const headers = ['Machine', 'Pièce', 'Modèle', 'Stratégie', 'Horizon', 'MAE', 'MAPE', 'RMSE', 'R²', 'Date'];
    const rows = savedForecasts.map(f => [
      f.machine,
      f.partReference,
      f.model.toUpperCase(),
      f.strategy,
      `${f.horizon} mois`,
      f.metrics.mae,
      f.metrics.mape,
      f.metrics.rmse,
      f.metrics.r2,
      new Date(f.trainedAt).toLocaleDateString('fr-FR'),
    ]);

    // Tab-separated format for Excel
    const tsv = [headers.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `previsions_pdr_${new Date().toISOString().split('T')[0]}.xls`;
    link.click();
  };

  const loadPartsForMachine = async (machine: string) => {
    try {
      const records = await db.pdrHistory
        .where('machine')
        .equals(machine)
        .toArray();

      // Group by part and count usage
      const partMap: Record<string, { name: string; count: number }> = {};
      records.forEach(record => {
        if (record.partReference) {
          const ref = record.partReference;
          if (!partMap[ref]) {
            partMap[ref] = {
              name: record.partDesignation || 'Sans nom',
              count: 0,
            };
          }
          partMap[ref].count += record.partQuantity || 1;
        }
      });

      const parts = Object.entries(partMap).map(([ref, data]) => ({
        reference: ref,
        designation: data.name,
        totalUsage: data.count,
      }));

      parts.sort((a, b) => b.totalUsage - a.totalUsage);
      setAvailableParts(parts);
    } catch (error) {
      console.error('Error loading parts:', error);
    }
  };

  const trainForecastModel = async () => {
    if (!forecastMachine || !forecastPart) {
      setTrainingError('Veuillez sélectionner une machine et une pièce');
      return;
    }

    setIsTraining(true);
    setTrainingError(null);
    setForecastResult(null);

    try {
      // --- ÉTAPE 1: Récupérer les données historiques depuis IndexedDB ---
      console.log(`📊 Récupération des données historiques pour ${forecastMachine} / ${forecastPart}...`);
      
      const allRecords = await db.pdrHistory
        .where('machine')
        .equals(forecastMachine)
        .toArray();

      if (allRecords.length === 0) {
        setTrainingError('Aucune donnée historique pour cette machine');
        setIsTraining(false);
        return;
      }

      // Filtrer les enregistrements de cette pièce spécifique
      const partRecords = allRecords.filter(r => r.partReference === forecastPart);
      
      if (partRecords.length === 0) {
        setTrainingError('Aucune donnée historique pour cette pièce');
        setIsTraining(false);
        return;
      }

      // Agréger par mois
      const monthMap: Record<string, number> = {};
      
      partRecords.forEach(record => {
        const date = record.interventionDate;
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const quantity = record.partQuantity || 0;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + quantity;
      });

      // 🔥 NORMALISATION: Remplir TOUS les mois jusqu'à la dernière date du CSV
      // (PAS jusqu'à aujourd'hui pour ne pas inventer des 0 qui n'existent pas!)
      const sortedMonths = Object.keys(monthMap).sort();
      
      if (sortedMonths.length === 0) {
        setTrainingError('Aucune donnée de consommation trouvée');
        setIsTraining(false);
        return;
      }

      // Trouver la dernière date RÉELLE dans TOUS les enregistrements (pas juste cette pièce)
      const allDates = allRecords.map(r => r.interventionDate).sort((a, b) => b.getTime() - a.getTime());
      const lastRealDate = allDates[0]; // Date la plus récente dans le CSV
      
      if (!lastRealDate) {
        setTrainingError('Aucune date d\'intervention trouvée dans les données');
        setIsTraining(false);
        return;
      }
      
      // Démarrer depuis le premier mois d'historique de cette pièce
      const startDate = new Date(sortedMonths[0] + '-01');
      // Terminer à la dernière date RÉELLE du CSV (pas aujourd'hui!)
      const endDate = new Date(lastRealDate.getFullYear(), lastRealDate.getMonth(), 1);

      console.log(`📅 Normalisation: ${startDate.toISOString().slice(0,7)} → ${endDate.toISOString().slice(0,7)} (dernière date CSV)`);

      // Générer TOUS les mois entre start et dernière date CSV avec 0 si pas de consommation
      const historicalData: Array<{ month: string; quantity: number }> = [];
      const currentMonth = new Date(startDate);

      while (currentMonth <= endDate) {
        const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
        historicalData.push({
          month: monthKey,
          quantity: monthMap[monthKey] || 0, // 0 si pas de consommation ce mois
        });
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }

      console.log(`📈 ${historicalData.length} mois normalisés (dont ${sortedMonths.length} avec consommation réelle)`);
      console.log(`🔮 Les prévisions commenceront à partir de: ${new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1).toISOString().slice(0,7)}`);

      if (historicalData.length < 3) {
        setTrainingError('Pas assez de données historiques (minimum 3 mois requis)');
        setIsTraining(false);
        return;
      }

      // --- ÉTAPE 2: Récupérer le token d'authentification Supabase ---
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setTrainingError('Session expirée. Veuillez vous reconnecter.');
        setIsTraining(false);
        return;
      }

      // --- ÉTAPE 3: Préparer les paramètres du modèle selon le type sélectionné ---
      let modelParams: any = {};
      
      if (forecastModel === 'prophet') {
        modelParams = {
          changepoint_prior_scale: prophetChangepointPrior,
          seasonality_mode: prophetSeasonalityMode,
          growth: prophetGrowth,
        };
      } else if (forecastModel === 'arima') {
        modelParams = {
          order: [arimaP, arimaD, arimaQ],
        };
      } else if (forecastModel === 'lstm') {
        modelParams = {
          lookback: lookbackWindow,
          units: lstmUnits,
          layers: lstmLayers,
          dropout: lstmDropout,
          epochs: lstmEpochs,
        };
      }

      // --- ÉTAPE 4: Appeler l'API backend Python avec les données ---
      console.log(`🤖 Entraînement du modèle ${forecastModel} via API backend...`);
      
      const response = await fetch('http://localhost:8000/api/v1/pdr/forecast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          historical_data: historicalData, // Envoyer les données directement
          machine: forecastMachine,
          part_reference: forecastPart,
          model_type: forecastModel,
          horizon: forecastHorizon,
          params: modelParams,
          use_mtbf: useMtbf,
          safety_factor: safetyFactor,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Erreur inconnue' }));
        throw new Error(errorData.detail || `Erreur HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Prévision reçue:', result);

      // 4. Convertir le format de réponse du backend au format attendu par le frontend
      // Historique: afficher uniquement les valeurs réelles (actual)
      const historical = result.historical.map((h: any) => ({
        month: h.month,
        actual: h.actual,
        forecast: null, // Pas de prévision dans l'historique
        lower: null,
        upper: null,
      }));

      // Prévisions: afficher uniquement les valeurs prédites (forecast)
      const forecasts = result.forecasts.map((f: any) => ({
        month: f.month,
        actual: null, // Pas de valeur réelle dans les prévisions futures
        forecast: f.forecast,
        lower: f.lower,
        upper: f.upper,
      }));

      // Combiner: historique d'abord, puis prévisions
      const combined = [...historical, ...forecasts];

      // 5. Mettre à jour l'état avec les vraies prévisions ML
      setForecastResult({
        historical,
        forecasts,
        combined,
        metrics: {
          mae: result.metrics.mae.toFixed(2),
          mape: result.metrics.mape.toFixed(1),
          rmse: result.metrics.rmse.toFixed(2),
          r2: result.metrics.r2.toFixed(3),
        },
        strategy: result.strategy,
        strategyReason: result.strategy_reason,
        usageStats: {
          avgUsage: result.usage_stats.mean_usage.toFixed(2),
          nonZeroMonths: result.usage_stats.non_zero_count,
          nonZeroPercentage: result.usage_stats.non_zero_percentage.toFixed(1),
          totalMonths: result.usage_stats.n_months,
        },
        model: result.model.toUpperCase(),
        trainedAt: new Date(result.trained_at),
        mtbfStats: result.mtbf_stats || null,
        mtbfWeight: result.mtbf_weight || null,
        safetyFactor: result.safety_factor || 1.0,
        forecastingMethod: result.forecasting_method || result.model,
        warning: result.warning || null,
      });

      console.log('✅ Modèle ML réel entraîné avec succès!');

    } catch (error) {
      console.error('Erreur lors de la prévision ML:', error);
      setTrainingError(
        error instanceof Error 
          ? error.message 
          : 'Erreur lors de la génération des prévisions. Vérifiez que le backend Python est démarré.'
      );
    } finally {
      setIsTraining(false);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    if (!file) return;
    setSelectedFile(file);
    setImportResult(null);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleImport = async () => {
    if (!selectedFile) return;
    
    setIsImporting(true);
    setImportResult(null);
    
    try {
      const result = await importPDRHistory(selectedFile);
      setImportResult(result);
      
      if (result.success) {
        const statsData = await getPDRStats();
        setStats(statsData);
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Erreur inconnue'],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearData = async () => {
    if (confirm('⚠️ Êtes-vous sûr de vouloir supprimer toutes les données PDR ?\n\nCette action est irréversible.')) {
      try {
        await clearPDRHistory();
        setStats(null);
        setImportResult(null);
        setSelectedFile(null);
        alert('✅ Base de données vidée avec succès !');
      } catch (error) {
        console.error('Error clearing data:', error);
        alert('❌ Erreur lors de la suppression des données');
      }
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    }).format(date);
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-lg">
        <div className="px-6 py-8">
          <h1 className="text-3xl font-bold mb-2">Prévision PDR</h1>
          <p className="text-orange-100">
            Gestion et prévision des pièces de rechange
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-orange-400/30 px-6">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-6 py-4 font-medium transition-colors border-b-2 ${
              activeTab === 'import'
                ? 'border-white text-white'
                : 'border-transparent text-orange-100 hover:text-white'
            }`}
          >
            <DocumentArrowUpIcon className="w-5 h-5 inline-block mr-2" />
            Import
          </button>
          <button
            onClick={() => setActiveTab('historique')}
            className={`px-6 py-4 font-medium transition-colors border-b-2 ${
              activeTab === 'historique'
                ? 'border-white text-white'
                : 'border-transparent text-orange-100 hover:text-white'
            }`}
          >
            <ChartBarIcon className="w-5 h-5 inline-block mr-2" />
            Historique
          </button>
          <button
            onClick={() => setActiveTab('prevision')}
            className={`px-6 py-4 font-medium transition-colors border-b-2 ${
              activeTab === 'prevision'
                ? 'border-white text-white'
                : 'border-transparent text-orange-100 hover:text-white'
            }`}
          >
            <ChartBarIcon className="w-5 h-5 inline-block mr-2" />
            Prévision
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-6 py-4 font-medium transition-colors border-b-2 ${
              activeTab === 'config'
                ? 'border-white text-white'
                : 'border-transparent text-orange-100 hover:text-white'
            }`}
          >
            <Cog6ToothIcon className="w-5 h-5 inline-block mr-2" />
            Configuration
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'import' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Clear Data Button - Always visible */}
            <div className="flex justify-end">
              <button
                onClick={handleClearData}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-600 rounded-lg transition-colors"
              >
                🗑️ Vider la base de données
              </button>
            </div>

            {/* Statistics Card */}
            {stats && stats.totalRecords > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 border border-orange-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Données importées
                  </h2>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-orange-600">
                      {stats.totalRecords.toLocaleString('fr-FR')}
                    </div>
                    <div className="text-sm text-gray-600">Interventions</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-amber-600">
                      {stats.uniqueMachines}
                    </div>
                    <div className="text-sm text-gray-600">Machines</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-600">
                      {stats.uniqueParts}
                    </div>
                    <div className="text-sm text-gray-600">Pièces uniques</div>
                  </div>
                  {stats.dateRange && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <div className="text-sm font-medium text-orange-600">
                        {formatDate(stats.dateRange.start)}
                      </div>
                      <div className="text-xs text-gray-500">à</div>
                      <div className="text-sm font-medium text-orange-600">
                        {formatDate(stats.dateRange.end)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Import Card */}
            <div className="bg-white rounded-lg shadow-md border border-orange-200 overflow-hidden">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Importer l'historique PDR
                </h2>
                
                {/* Dropzone */}
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <ArrowUpTrayIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full">
                        <DocumentArrowUpIcon className="w-5 h-5 mr-2" />
                        <span className="font-medium">{selectedFile.name}</span>
                        <span className="ml-2 text-sm text-orange-600">
                          ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Cliquez sur "Importer" pour traiter le fichier
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg text-gray-700 mb-2">
                        Glissez-déposez un fichier CSV ou XLSX
                      </p>
                      <p className="text-sm text-gray-500">
                        ou cliquez pour sélectionner un fichier
                      </p>
                    </div>
                  )}
                </div>

                {/* Import Button */}
                {selectedFile && (
                  <div className="mt-6">
                    <button
                      onClick={handleImport}
                      disabled={isImporting}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-3 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                    >
                      {isImporting ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Importation en cours...
                        </span>
                      ) : (
                        'Importer les données'
                      )}
                    </button>
                  </div>
                )}

                {/* Import Result */}
                {importResult && (
                  <div className={`mt-6 p-4 rounded-lg border ${
                    importResult.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-start">
                      {importResult.success ? (
                        <CheckCircleIcon className="w-6 h-6 text-green-600 mr-3 flex-shrink-0" />
                      ) : (
                        <ExclamationCircleIcon className="w-6 h-6 text-red-600 mr-3 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <h3 className={`font-semibold mb-1 ${
                          importResult.success ? 'text-green-900' : 'text-red-900'
                        }`}>
                          {importResult.success ? 'Import réussi' : 'Erreur d\'importation'}
                        </h3>
                        {importResult.success ? (
                          <p className="text-sm text-green-700">
                            {importResult.imported} enregistrements importés
                            {importResult.skipped > 0 && (
                              <span className="text-green-600">
                                {' '}({importResult.skipped} lignes invalides ignorées)
                              </span>
                            )}
                          </p>
                        ) : (
                          <ul className="text-sm text-red-700 space-y-1">
                            {importResult.errors.map((error, idx) => (
                              <li key={idx}>• {error}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                <div className="mt-8 bg-amber-50 rounded-lg p-6 border border-amber-200">
                  <h3 className="font-semibold text-amber-900 mb-3">
                    Format attendu
                  </h3>
                  <ul className="text-sm text-amber-800 space-y-2">
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span>
                        <strong>CSV séparé par point-virgule</strong> ou fichier <strong>XLSX</strong>
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span>
                        <strong>Colonnes requises :</strong> Date intervention, Désignation (machine)
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span>
                        <strong>Colonnes de pièces (optionnelles) :</strong> [Pièce].Désignation, [Pièce].Référence, [Pièce].Quantité
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span>
                        <strong>Format date :</strong> JJ/MM/AAAA (ex: 25/04/2025)
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span>
                        <strong>Nombres :</strong> Décimales avec virgule (ex: 0,5)
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span>
                        <strong>Note :</strong> Toutes les interventions sont importées, même sans pièce de rechange
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'historique' && (
          <div className="max-w-full mx-auto space-y-6">
            {/* Filters and Actions */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-orange-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <FunnelIcon className="w-5 h-5 text-orange-600" />
                  <div>
                    <label htmlFor="machine-filter" className="block text-sm font-medium text-gray-700 mb-1">
                      Filtrer par machine
                    </label>
                    <select
                      id="machine-filter"
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                      className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500"
                    >
                      <option value="ALL">Toutes les machines</option>
                      {machines.map(machine => (
                        <option key={machine} value={machine}>{machine}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={exportToExcel}
                  disabled={historyData.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                  Exporter Excel
                </button>
              </div>
            </div>

            {/* Pivot Table with Heatmap */}
            {isLoadingHistory ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center border border-orange-200">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Chargement des données...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center border border-orange-200">
                <ChartBarIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Aucune donnée
                </h3>
                <p className="text-gray-500">
                  Importez des données PDR pour voir l'historique
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow-md border border-orange-200 overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Historique d'utilisation des pièces
                      {selectedMachine !== 'ALL' && ` - ${selectedMachine}`}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {historyData.length} pièces • Cliquez sur une ligne pour voir la tendance temporelle
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="sticky left-0 z-10 bg-orange-50 px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Référence
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider min-w-[200px]">
                            Désignation
                          </th>
                          {Array.from(
                            new Set(
                              historyData.flatMap(row => Object.keys(row.years).map(y => parseInt(y)))
                            )
                          ).sort().map(year => (
                            <th key={year} className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                              {year}
                            </th>
                          ))}
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-orange-100">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {historyData.map((row, idx) => {
                          const years = Array.from(
                            new Set(
                              historyData.flatMap(r => Object.keys(r.years).map(y => parseInt(y)))
                            )
                          ).sort();
                          const maxValue = Math.max(...Object.values(row.years).map(v => v as number));
                          
                          return (
                            <tr 
                              key={idx}
                              onClick={() => row.partRef !== 'Sans pièce' && loadTimeSeriesForPart(row.partRef)}
                              className={`hover:bg-orange-50 transition-colors ${row.partRef !== 'Sans pièce' ? 'cursor-pointer' : ''}`}
                            >
                              <td className="sticky left-0 z-10 bg-white px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {row.partRef}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-700">
                                {row.partName}
                              </td>
                              {years.map(year => {
                                const value = row.years[year] || 0;
                                return (
                                  <td 
                                    key={year} 
                                    className={`px-6 py-4 text-center text-sm ${getHeatmapColor(value, maxValue)}`}
                                  >
                                    {value}
                                  </td>
                                );
                              })}
                              <td className="px-6 py-4 text-center text-sm font-bold text-gray-900 bg-orange-50">
                                {row.total}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Time Series Chart */}
                {selectedPart && timeSeriesData.length > 0 && (
                  <div className="bg-white rounded-lg shadow-md border border-orange-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Évolution temporelle - {historyData.find(d => d.partRef === selectedPart)?.partName}
                      </h3>
                      <button
                        onClick={() => setSelectedPart(null)}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        ✕ Fermer
                      </button>
                    </div>
                    
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis label={{ value: 'Quantité', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="quantity" 
                          stroke="#f97316" 
                          strokeWidth={2}
                          dot={{ fill: '#f97316', r: 4 }}
                          name="Quantité utilisée"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Legend */}
                <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
                  <h3 className="font-semibold text-amber-900 mb-3">
                    Légende du heatmap
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-6 bg-gray-50 border border-gray-300 rounded"></div>
                      <span className="text-sm text-gray-700">Aucune utilisation</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-6 bg-green-500 rounded"></div>
                      <span className="text-sm text-gray-700">Faible (0-25%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-6 bg-yellow-500 rounded"></div>
                      <span className="text-sm text-gray-700">Moyen (25-50%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-6 bg-orange-500 rounded"></div>
                      <span className="text-sm text-gray-700">Élevé (50-75%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-6 bg-red-500 rounded"></div>
                      <span className="text-sm text-gray-700">Très élevé (75-100%)</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'prevision' && (
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-8 border border-orange-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <ChartBarIcon className="w-8 h-8 text-orange-600" />
                Prévision de la Demande
              </h2>

              {/* Configuration Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Machine Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Machine
                  </label>
                  <select
                    value={forecastMachine}
                    onChange={(e) => setForecastMachine(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="">Sélectionner une machine</option>
                    {machines.map(machine => (
                      <option key={machine} value={machine}>{machine}</option>
                    ))}
                  </select>
                </div>

                {/* Part Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pièce de rechange
                  </label>
                  <select
                    value={forecastPart}
                    onChange={(e) => setForecastPart(e.target.value)}
                    disabled={!forecastMachine}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Sélectionner une pièce</option>
                    {availableParts.map(part => (
                      <option key={part.reference} value={part.reference}>
                        {part.reference} - {part.designation} ({part.totalUsage} utilisations)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Horizon Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Horizon de prévision
                  </label>
                  <select
                    value={forecastHorizon}
                    onChange={(e) => setForecastHorizon(parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value={1}>1 mois</option>
                    <option value={3}>3 mois</option>
                    <option value={6}>6 mois</option>
                    <option value={12}>12 mois</option>
                  </select>
                </div>

                {/* Model Selection */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modèle de prévision
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['prophet', 'arima', 'sarima', 'lstm'] as const).map(model => (
                      <button
                        key={model}
                        onClick={() => setForecastModel(model)}
                        className={`px-4 py-3 rounded-lg font-medium transition-all ${
                          forecastModel === model
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={
                          model === 'prophet' ? 'Tendances & saisonnalité (Facebook Prophet)' :
                          model === 'arima' ? 'ARIMA - Séries stationnaires' :
                          model === 'sarima' ? 'SARIMA - ARIMA avec saisonnalité' :
                          'LSTM - Deep learning pour patterns complexes'
                        }
                      >
                        {model === 'prophet' ? 'Prophet' : model.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {forecastModel === 'prophet' && '✨ Recommandé: Capture tendances et saisonnalités automatiquement'}
                    {forecastModel === 'arima' && '📊 Statistique: Bon pour séries stationnaires sans saisonnalité forte'}
                    {forecastModel === 'sarima' && '📈 Saisonnier: ARIMA avec composante saisonnière (12 mois)'}
                    {forecastModel === 'lstm' && '🧠 Deep Learning: Pour patterns non-linéaires complexes'}
                  </p>
                </div>

                {/* MTBF Enhancement Toggle */}
                <div className="col-span-1 md:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="use-mtbf"
                      checked={useMtbf}
                      onChange={(e) => setUseMtbf(e.target.checked)}
                      className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <label htmlFor="use-mtbf" className="font-semibold text-blue-900 cursor-pointer">
                        🔧 Activer l'amélioration MTBF (recommandé)
                      </label>
                      <p className="text-xs text-blue-700 mt-1">
                        Combine les prévisions temporelles avec le MTBF calculé (temps moyen entre pannes) pour des prévisions plus fiables basées sur la fiabilité machine.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Safety Factor Control */}
                <div className="col-span-1 md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-amber-900 mb-2">
                    🛡️ Facteur de sécurité: {safetyFactor.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.1"
                    value={safetyFactor}
                    onChange={(e) => setSafetyFactor(parseFloat(e.target.value))}
                    className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-amber-700 mt-1">
                    <span>1.0 (aucun)</span>
                    <span>1.2 (24/7 recommandé)</span>
                    <span>2.0 (très conservateur)</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    Multiplie les prévisions pour compenser l'incertitude sur l'intensité d'utilisation. 
                    <strong> 1.2x = hypothèse 24/7 haute intensité</strong> (recommandé pour éviter les ruptures).
                  </p>
                </div>
              </div>

              {/* Train Button */}
              <div className="flex justify-center mb-8">
                <button
                  onClick={trainForecastModel}
                  disabled={!forecastMachine || !forecastPart || isTraining}
                  className="px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                >
                  {isTraining ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Entraînement en cours...
                    </span>
                  ) : (
                    '🔮 Entraîner le modèle'
                  )}
                </button>
              </div>

              {/* Error Display */}
              {trainingError && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start">
                    <ExclamationCircleIcon className="w-6 h-6 text-red-600 mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-red-900 mb-1">Erreur</h3>
                      <p className="text-sm text-red-700">{trainingError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Forecast Results */}
              {forecastResult && (
                <>
                  {/* Strategy Banner */}
                  <div className={`mb-6 p-4 rounded-lg border ${
                    forecastResult.strategy === 'time-series' 
                      ? 'bg-green-50 border-green-200'
                      : forecastResult.strategy === 'statistical'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}>
                    <div className="flex items-start">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                        forecastResult.strategy === 'time-series'
                          ? 'bg-green-500'
                          : forecastResult.strategy === 'statistical'
                          ? 'bg-yellow-500'
                          : 'bg-orange-500'
                      }`}>
                        <span className="text-white font-bold">
                          {forecastResult.strategy === 'time-series' ? '📈' : forecastResult.strategy === 'statistical' ? '📊' : '🛡️'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className={`font-semibold mb-1 ${
                          forecastResult.strategy === 'time-series'
                            ? 'text-green-900'
                            : forecastResult.strategy === 'statistical'
                            ? 'text-yellow-900'
                            : 'text-orange-900'
                        }`}>
                          Stratégie: {
                            forecastResult.strategy === 'time-series'
                              ? 'Prévision par Séries Temporelles'
                              : forecastResult.strategy === 'statistical'
                              ? 'Prévision Statistique'
                              : 'Stock de Sécurité Recommandé'
                          }
                        </h3>
                        <p className={`text-sm ${
                          forecastResult.strategy === 'time-series'
                            ? 'text-green-700'
                            : forecastResult.strategy === 'statistical'
                            ? 'text-yellow-700'
                            : 'text-orange-700'
                        }`}>
                          {forecastResult.strategyReason}
                        </p>
                        {forecastResult.usageStats && (
                          <div className="mt-2 text-xs text-gray-600 flex gap-4">
                            <span>📦 Utilisation moyenne: {forecastResult.usageStats.avgUsage} unités/mois</span>
                            <span>📅 Mois actifs: {forecastResult.usageStats.nonZeroMonths}/{forecastResult.usageStats.totalMonths} ({forecastResult.usageStats.nonZeroPercentage}%)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MTBF Stats Display */}
                  {forecastResult.mtbfStats && (
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                        🔧 Fiabilité Machine (MTBF)
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-blue-600 font-medium">MTBF</div>
                          <div className="text-lg font-bold text-blue-900">
                            {forecastResult.mtbfStats.mtbf_months.toFixed(1)} mois
                          </div>
                          <div className="text-xs text-blue-600">({forecastResult.mtbfStats.mtbf_days} jours)</div>
                        </div>
                        <div>
                          <div className="text-blue-600 font-medium">Pannes historiques</div>
                          <div className="text-lg font-bold text-blue-900">{forecastResult.mtbfStats.n_failures}</div>
                        </div>
                        <div>
                          <div className="text-blue-600 font-medium">Taux de panne</div>
                          <div className="text-lg font-bold text-blue-900">{forecastResult.mtbfStats.failure_rate.toFixed(3)}/mois</div>
                        </div>
                        <div>
                          <div className="text-blue-600 font-medium">Fiabilité</div>
                          <div className={`text-lg font-bold ${
                            forecastResult.mtbfStats.reliability === 'high' 
                              ? 'text-green-900' 
                              : forecastResult.mtbfStats.reliability === 'medium'
                              ? 'text-yellow-900'
                              : 'text-red-900'
                          }`}>
                            {forecastResult.mtbfStats.reliability === 'high' ? '✅ Élevée' : 
                             forecastResult.mtbfStats.reliability === 'medium' ? '⚠️ Moyenne' : '❌ Faible'}
                          </div>
                        </div>
                      </div>
                      {forecastResult.mtbfWeight && (
                        <div className="mt-3 text-xs text-blue-700 bg-blue-100 rounded p-2">
                          💡 Prévision hybride: {(forecastResult.mtbfWeight * 100).toFixed(0)}% basée sur MTBF, {((1-forecastResult.mtbfWeight) * 100).toFixed(0)}% sur tendance temporelle
                        </div>
                      )}
                    </div>
                  )}

                  {/* Warning Banner */}
                  {forecastResult.warning && (
                    <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
                      <div className="flex items-start">
                        <ExclamationCircleIcon className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-yellow-900 mb-1">⚠️ Avertissement</h4>
                          <p className="text-sm text-yellow-800">{forecastResult.warning}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Safety Factor Info */}
                  {forecastResult.safetyFactor && forecastResult.safetyFactor > 1.0 && (
                    <div className="mb-6 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-amber-700">🛡️</span>
                        <span className="text-amber-900 font-medium">
                          Facteur de sécurité appliqué: {forecastResult.safetyFactor}x
                        </span>
                        <span className="text-amber-700">
                          (hypothèse: utilisation intensive 24/7 pour éviter les ruptures)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Metrics Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                      <div className="text-sm text-blue-600 font-medium mb-1">MAE</div>
                      <div className="text-2xl font-bold text-blue-900">{forecastResult.metrics.mae}</div>
                      <div className="text-xs text-blue-600 mt-1">Mean Absolute Error</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                      <div className="text-sm text-green-600 font-medium mb-1">MAPE</div>
                      <div className="text-2xl font-bold text-green-900">{forecastResult.metrics.mape}%</div>
                      <div className="text-xs text-green-600 mt-1">Mean Absolute % Error</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                      <div className="text-sm text-purple-600 font-medium mb-1">RMSE</div>
                      <div className="text-2xl font-bold text-purple-900">{forecastResult.metrics.rmse}</div>
                      <div className="text-xs text-purple-600 mt-1">Root Mean Square Error</div>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                      <div className="text-sm text-orange-600 font-medium mb-1">R²</div>
                      <div className="text-2xl font-bold text-orange-900">{forecastResult.metrics.r2}</div>
                      <div className="text-xs text-orange-600 mt-1">Coefficient of Determination</div>
                    </div>
                  </div>

                  {/* Forecast Chart - Enhanced */}
                  <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          📈 Historique et Prévisions
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Modèle: <span className="font-semibold text-orange-600">{forecastModel.toUpperCase()}</span> | 
                          Machine: <span className="font-semibold">{forecastMachine}</span> | 
                          Pièce: <span className="font-semibold">{forecastPart}</span>
                        </p>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                          <span>Historique</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          <span>Prévision</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-0.5 bg-gray-400"></div>
                          <span>Confiance</span>
                        </div>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={500}>
                      <LineChart 
                        data={forecastResult.combined}
                        margin={{ top: 10, right: 50, left: 20, bottom: 70 }}
                      >
                        <defs>
                          <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.05}/>
                          </linearGradient>
                          <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="month" 
                          angle={-45} 
                          textAnchor="end" 
                          height={80}
                          tick={{ fontSize: 10, fill: '#6b7280' }}
                          stroke="#9ca3af"
                          interval={Math.floor(forecastResult.combined.length / 12)} // Afficher tous les N mois
                        />
                        <YAxis 
                          label={{ 
                            value: 'Quantité de pièces', 
                            angle: -90, 
                            position: 'insideLeft',
                            style: { fontSize: 13, fill: '#374151', fontWeight: 600 }
                          }}
                          tick={{ fontSize: 11, fill: '#6b7280' }}
                          stroke="#9ca3af"
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            border: '2px solid #e5e7eb',
                            borderRadius: '12px',
                            padding: '16px',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
                          }}
                          labelStyle={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '13px' }}
                          itemStyle={{ fontSize: '12px', padding: '4px 0' }}
                        />
                        <Legend 
                          wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }}
                          iconType="line"
                          iconSize={20}
                        />
                        {/* Confidence interval - upper bound (subtle, behind forecast) */}
                        <Line 
                          type="monotone" 
                          dataKey="upper" 
                          stroke="#d1d5db" 
                          strokeWidth={1}
                          strokeDasharray="2 4"
                          name="Borne sup."
                          dot={false}
                          opacity={0.5}
                        />
                        {/* Confidence interval - lower bound (subtle, behind forecast) */}
                        <Line 
                          type="monotone" 
                          dataKey="lower" 
                          stroke="#d1d5db" 
                          strokeWidth={1}
                          strokeDasharray="2 4"
                          name="Borne inf."
                          dot={false}
                          opacity={0.5}
                        />
                        {/* Historical data - Orange line with area fill */}
                        <Line 
                          type="monotone" 
                          dataKey="actual" 
                          stroke="#f97316" 
                          strokeWidth={3}
                          name="📊 Historique"
                          dot={{ fill: '#f97316', r: 5, strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 8, strokeWidth: 3, stroke: '#fff' }}
                          fill="url(#colorActual)"
                        />
                        {/* Forecast - Green dashed line with area fill (on top) */}
                        <Line 
                          type="monotone" 
                          dataKey="forecast" 
                          stroke="#10b981" 
                          strokeWidth={4}
                          strokeDasharray="12 6"
                          name="🔮 Prévisions ML"
                          dot={{ fill: '#10b981', r: 6, strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 9, strokeWidth: 3, stroke: '#fff' }}
                          fill="url(#colorForecast)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    
                    {/* Chart Info */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center gap-4">
                          <span>📊 {forecastResult.historical?.length || 0} mois historiques</span>
                          <span>🔮 {forecastResult.forecasts?.length || 0} mois de prévision</span>
                          <span>🎯 Horizon: {forecastHorizon} mois</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">Entraîné le: </span>
                          <span>{new Date(forecastResult.trainedAt).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Forecast Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Mois
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Prévision
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Intervalle de confiance (70%)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {forecastResult.forecasts.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-orange-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {row.month}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="font-semibold text-green-600">{row.forecast}</span> unités
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              [{row.lower} - {row.upper}]
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions */}
                  <div className="mt-8 flex justify-center gap-4">
                    <button
                      onClick={saveForecastConfig}
                      className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg"
                    >
                      💾 Sauvegarder cette configuration
                    </button>
                    <button
                      onClick={() => {
                        setForecastResult(null);
                        setForecastMachine('');
                        setForecastPart('');
                      }}
                      className="px-6 py-2 border border-orange-500 text-orange-600 font-medium rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      🔄 Nouvelle prévision
                    </button>
                  </div>
                </>
              )}

              {/* Instructions */}
              {!forecastResult && !trainingError && (
                <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
                  <h3 className="font-semibold text-amber-900 mb-3">
                    Comment utiliser
                  </h3>
                  <ul className="text-sm text-amber-800 space-y-2">
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">1.</span>
                      <span>Sélectionnez une <strong>machine</strong> pour afficher les pièces associées</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">2.</span>
                      <span>Choisissez une <strong>pièce de rechange</strong> pour la prévision</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">3.</span>
                      <span>Configurez l'<strong>horizon</strong> (1-12 mois) et le <strong>modèle</strong> (Prophet/ARIMA/SARIMA/LSTM)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">4.</span>
                      <span>Cliquez sur <strong>"Entraîner le modèle"</strong> pour générer les prévisions</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-amber-600 mr-2">•</span>
                      <span className="text-amber-700">
                        <strong>Note :</strong> Le système crée une série temporelle complète (mois sans utilisation = 0) et prédit au-delà de la dernière date
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-8 border border-orange-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Cog6ToothIcon className="w-8 h-8 text-orange-600" />
                Configuration & Paramètres
              </h2>

              {/* Saved Forecasts Section */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  📊 Prévisions Sauvegardées
                </h3>
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  {savedForecasts.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500">Aucune prévision sauvegardée</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Entraînez un modèle dans l'onglet "Prévision" pour le sauvegarder ici
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {savedForecasts.map((forecast) => (
                        <div key={forecast.id} className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-gray-900">{forecast.machine}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-gray-700">{forecast.partReference}</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  forecast.strategy === 'time-series'
                                    ? 'bg-green-100 text-green-700'
                                    : forecast.strategy === 'statistical'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {forecast.model.toUpperCase()}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 flex gap-4">
                                <span>📅 {new Date(forecast.trainedAt).toLocaleDateString('fr-FR')}</span>
                                <span>📈 Horizon: {forecast.horizon} mois</span>
                                <span>🎯 R²: {forecast.metrics.r2}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteSavedForecast(forecast.id)}
                              className="ml-4 text-red-600 hover:text-red-800 transition-colors"
                              title="Supprimer"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Forecast Strategy Settings */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    ⚙️ Advanced Settings
                  </h3>
                  <button
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 font-medium rounded-lg transition-colors"
                  >
                    {showAdvancedSettings ? '🔼 Collapse' : '🔽 Expand'}
                  </button>
                </div>
                
                {showAdvancedSettings && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-6 border-2 border-orange-200">
                    
                    {/* ARIMA Configuration */}
                    <div className="mb-6 bg-white rounded-lg p-5 border border-blue-200">
                      <h4 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">📐</span>
                        ARIMA Configuration
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">p (AR order)</label>
                          <select
                            value={arimaP}
                            onChange={(e) => setArimaP(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            {[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">d (Differencing)</label>
                          <select
                            value={arimaD}
                            onChange={(e) => setArimaD(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            {[0,1,2].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">q (MA order)</label>
                          <select
                            value={arimaQ}
                            onChange={(e) => setArimaQ(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            {[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Prophet Configuration */}
                    <div className="mb-6 bg-white rounded-lg p-5 border border-purple-200">
                      <h4 className="font-semibold text-purple-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">🔮</span>
                        Prophet Configuration
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Changepoint Prior Scale: {prophetChangepointPrior.toFixed(3)}
                          </label>
                          <input
                            type="range"
                            min="0.001"
                            max="0.5"
                            step="0.001"
                            value={prophetChangepointPrior}
                            onChange={(e) => setProphetChangepointPrior(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0.001 (Less flexible)</span>
                            <span>0.5 (More flexible)</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Seasonality Mode</label>
                            <div className="flex gap-4">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  checked={prophetSeasonalityMode === 'additive'}
                                  onChange={() => setProphetSeasonalityMode('additive')}
                                  className="mr-2"
                                />
                                <span className="text-sm">Additive</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  checked={prophetSeasonalityMode === 'multiplicative'}
                                  onChange={() => setProphetSeasonalityMode('multiplicative')}
                                  className="mr-2"
                                />
                                <span className="text-sm">Multiplicative</span>
                              </label>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Growth</label>
                            <div className="flex gap-4">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  checked={prophetGrowth === 'linear'}
                                  onChange={() => setProphetGrowth('linear')}
                                  className="mr-2"
                                />
                                <span className="text-sm">Linear</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  checked={prophetGrowth === 'logistic'}
                                  onChange={() => setProphetGrowth('logistic')}
                                  className="mr-2"
                                />
                                <span className="text-sm">Logistic</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LSTM Configuration */}
                    <div className="mb-6 bg-white rounded-lg p-5 border border-orange-200">
                      <h4 className="font-semibold text-orange-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">🧠</span>
                        LSTM Configuration
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Hidden Layers</label>
                          <select
                            value={lstmLayers}
                            onChange={(e) => setLstmLayers(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                          >
                            {[1,2,3,4].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Units per Layer</label>
                          <select
                            value={lstmUnits}
                            onChange={(e) => setLstmUnits(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                          >
                            {[32,64,128,256].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Epochs</label>
                          <select
                            value={lstmEpochs}
                            onChange={(e) => setLstmEpochs(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                          >
                            {[50,100,150,200].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Dropout Rate: {lstmDropout.toFixed(2)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.05"
                            value={lstmDropout}
                            onChange={(e) => setLstmDropout(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Time Series Features */}
                    <div className="mb-6 bg-white rounded-lg p-5 border border-green-200">
                      <h4 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">🔧</span>
                        Time Series Features
                      </h4>
                      <div className="space-y-3">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoSeasonality}
                            onChange={(e) => setAutoSeasonality(e.target.checked)}
                            className="mr-3 w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Auto-detect seasonality</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trendDecomposition}
                            onChange={(e) => setTrendDecomposition(e.target.checked)}
                            className="mr-3 w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Trend decomposition</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={handleOutliers}
                            onChange={(e) => setHandleOutliers(e.target.checked)}
                            className="mr-3 w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Handle outliers (IQR method)</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={logTransformation}
                            onChange={(e) => setLogTransformation(e.target.checked)}
                            className="mr-3 w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Log transformation</span>
                        </label>
                      </div>
                    </div>

                    {/* Windowing */}
                    <div className="mb-6 bg-white rounded-lg p-5 border border-yellow-200">
                      <h4 className="font-semibold text-yellow-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">⏱️</span>
                        Windowing
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Lookback Window</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={lookbackWindow}
                              onChange={(e) => setLookbackWindow(parseInt(e.target.value))}
                              min={1}
                              max={24}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                            />
                            <span className="text-sm text-gray-600">months</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Prediction Horizon</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={predictionHorizon}
                              onChange={(e) => setPredictionHorizon(parseInt(e.target.value))}
                              min={1}
                              max={24}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                            />
                            <span className="text-sm text-gray-600">months</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Strategy Thresholds */}
                    <div className="bg-white rounded-lg p-5 border border-gray-300">
                      <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <span className="text-xl">🎯</span>
                        Strategy Selection Thresholds
                      </h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium text-gray-700">R² Threshold (Time-Series)</label>
                            <p className="text-xs text-gray-500">Minimum for trend-based forecasting</p>
                          </div>
                          <input
                            type="number"
                            value={r2Threshold}
                            onChange={(e) => setR2Threshold(parseFloat(e.target.value))}
                            step={0.05}
                            min={0}
                            max={1}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium text-gray-700">Active Months %</label>
                            <p className="text-xs text-gray-500">Minimum for statistical forecasting</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={activeMonthsThreshold}
                              onChange={(e) => setActiveMonthsThreshold(parseInt(e.target.value))}
                              step={5}
                              min={5}
                              max={50}
                              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-gray-600">%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium text-gray-700">Safety Stock Confidence</label>
                            <p className="text-xs text-gray-500">Z-score for safety stock calculation</p>
                          </div>
                          <select
                            value={safetyStockConfidence}
                            onChange={(e) => setSafetyStockConfidence(parseFloat(e.target.value))}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                          >
                            <option value={1.28}>90% (1.28σ)</option>
                            <option value={1.65}>95% (1.65σ)</option>
                            <option value={1.96}>97.5% (1.96σ)</option>
                            <option value={2.33}>99% (2.33σ)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 flex gap-4">
                      <button
                        onClick={resetHyperparameters}
                        className="flex-1 px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                      >
                        🔄 Reset to Defaults
                      </button>
                      <button
                        onClick={savePreset}
                        className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                      >
                        💾 Save Preset
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Export & Integration */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  📤 Export & Intégration
                </h3>
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={exportForecastsToExcel}
                      disabled={savedForecasts.length === 0}
                      className="px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      📊 Export Excel
                    </button>
                    <button
                      onClick={exportForecastsToCSV}
                      disabled={savedForecasts.length === 0}
                      className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      📄 Export CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}