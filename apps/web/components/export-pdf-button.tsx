'use client';

import { Button } from '@kit/ui/button';
import { FileDown } from 'lucide-react';

interface ExportPDFButtonProps {
  data: {
    kpis?: Array<{ label: string; value: string | number }>;
    table?: {
      headers: string[];
      rows: any[];
    };
    title?: string;
    date?: string;
    machine?: string;
    summary?: any;
    analysisTable?: any[]; // AMDEC AI analysis results
  };
  filename: string;
  title: string;
  className?: string;
}

export function ExportPDFButton({ data, filename, title, className }: ExportPDFButtonProps) {
  const handleExport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentDate = new Date().toLocaleString('fr-FR');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @media print {
            @page { margin: 2cm; }
          }
          body { 
            font-family: Arial, sans-serif; 
            padding: 40px;
            max-width: 210mm;
            margin: 0 auto;
          }
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo { 
            font-size: 24px; 
            font-weight: bold; 
            color: #3b82f6;
          }
          .date { 
            color: #6b7280; 
            font-size: 14px;
          }
          .kpi-section {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 30px;
          }
          .kpi-card {
            padding: 15px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
          .kpi-value {
            font-size: 28px;
            font-weight: bold;
            color: #1f2937;
          }
          .kpi-label {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 5px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0;
          }
          th, td { 
            border: 1px solid #e5e7eb; 
            padding: 12px; 
            text-align: left;
          }
          th { 
            background-color: #f3f4f6; 
            font-weight: 600;
          }
          .critical { color: #ef4444; font-weight: bold; }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">🏭 GMAO Platform</div>
          <div class="date">📅 ${currentDate}</div>
        </div>
        
        <h1>${data.title || title}</h1>
        ${data.machine ? `<p style="color: #6b7280; margin-bottom: 20px;"><strong>Machine:</strong> ${data.machine}</p>` : ''}
        
        ${data.kpis ? `
          <div class="kpi-section">
            ${data.kpis.map((kpi) => `
              <div class="kpi-card">
                <div class="kpi-label">${kpi.label}</div>
                <div class="kpi-value">${kpi.value}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${data.summary?.topFailures ? `
          <h2>Top 5 Types de Pannes</h2>
          <table>
            <thead>
              <tr>
                <th>Type de panne</th>
                <th>Occurrences</th>
              </tr>
            </thead>
            <tbody>
              ${data.summary.topFailures.map(([type, count]: [string, number]) => `
                <tr>
                  <td>${type}</td>
                  <td><strong>${count}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${data.summary?.topComponents ? `
          <h2>Top 5 Composants Critiques</h2>
          <table>
            <thead>
              <tr>
                <th>Composant</th>
                <th>Nombre de pannes</th>
                <th>Coût total</th>
              </tr>
            </thead>
            <tbody>
              ${data.summary.topComponents.map(([comp, stats]: [string, any]) => `
                <tr>
                  <td>${comp}</td>
                  <td><strong>${stats.count}</strong></td>
                  <td>${Math.round(stats.cost).toLocaleString()} €</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${data.analysisTable && data.analysisTable.length > 0 ? `
          <h2>Analyse AMDEC (${data.machine})</h2>
          <table>
            <thead>
              <tr>
                <th>Composant</th>
                <th>Mode de défaillance</th>
                <th>F</th>
                <th>G</th>
                <th>D</th>
                <th>RPN</th>
                <th>Action recommandée</th>
              </tr>
            </thead>
            <tbody>
              ${data.analysisTable.map((row) => {
                const rpnClass = row.rpn >= 75 ? 'critical' : '';
                return `
                  <tr>
                    <td>${row.component}</td>
                    <td>${row.failureType}</td>
                    <td><strong>${row.frequency}</strong></td>
                    <td><strong>${row.severity}</strong></td>
                    <td><strong>${row.detectability}</strong></td>
                    <td class="${rpnClass}"><strong>${row.rpn}</strong></td>
                    <td style="font-size: 12px;">${row.action}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
            <strong>Légende:</strong> F = Fréquence (1-5), G = Gravité (1-5), D = Détectabilité (1-5), RPN = F×G×D (max 125)
          </p>
        ` : ''}

        ${data.table ? `
          <h2>Détails</h2>
          <table>
            <thead>
              <tr>
                ${data.table.headers.map((h) => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.table.rows.slice(0, 5).map((row) => `
                <tr>
                  ${Object.values(row).map((cell) => `<td>${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          Document généré automatiquement par GMAO Platform - ${currentDate}
        </div>

        <script>
          setTimeout(() => {
            window.print();
          }, 500);
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
  };

  return (
    <Button onClick={handleExport} variant="secondary" className={className || "gap-2 bg-white/20 text-white hover:bg-white/30 border border-white/30"}>
      <FileDown className="h-4 w-4" />
      Exporter PDF
    </Button>
  );
}
