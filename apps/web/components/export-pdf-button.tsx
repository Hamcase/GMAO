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
  };
  filename: string;
  title: string;
}

export function ExportPDFButton({ data, filename, title }: ExportPDFButtonProps) {
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
        
        <h1>${title}</h1>
        
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
    <Button onClick={handleExport} variant="outline" className="gap-2">
      <FileDown className="h-4 w-4" />
      Exporter PDF
    </Button>
  );
}
