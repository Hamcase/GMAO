"use client";

import React, { useState, useEffect, useRef } from 'react';
import { XIcon, ZoomInIcon, ZoomOutIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface Citation {
  citation_number: number;
  document_name: string;
  page_number: number;
  chunk_index: number;
  char_start: number;
  char_end: number;
  text: string;
  keywords?: string | string[];
  score?: number;
  rerank_score?: number;
}

interface PDFViewerWithHighlightProps {
  pdfUrl: string;
  citation: Citation;
  onClose: () => void;
}

export default function PDFViewerWithHighlight({
  pdfUrl,
  citation,
  onClose
}: PDFViewerWithHighlightProps) {
  const [scale, setScale] = useState(1.3);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(citation.page_number || 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [pageText, setPageText] = useState<string>('');
  const [renderKey, setRenderKey] = useState(0); // Force re-render
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const isRenderingRef = useRef<boolean>(false);

  // Load PDF document
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true);
        setError('');
        
        // Destroy previous PDF if exists
        if (pdfDocRef.current) {
          try {
            await pdfDocRef.current.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
          pdfDocRef.current = null;
        }
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(citation.page_number || 1);
        setLoading(false);
        
        // Force render after PDF is loaded
        setTimeout(() => {
          setRenderKey(prev => prev + 1);
        }, 100);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF');
        setLoading(false);
      }
    };

    loadPDF();

    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
      }
    };
  }, [pdfUrl, citation.page_number]);

  // Render current page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDocRef.current || !canvasRef.current) return;
      
      // Cancel previous render if still running
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }
      
      // Prevent concurrent renders
      if (isRenderingRef.current) {
        console.log('Render already in progress, skipping...');
        return;
      }
      
      isRenderingRef.current = true;

      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        const viewport = page.getViewport({ scale });
        
        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page
        const renderContext = {
          canvasContext: context!,
          viewport: viewport,
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
        renderTaskRef.current = null;

        // Extract text for highlighting
        const textContent = await page.getTextContent();
        let fullText = '';
        textContent.items.forEach((item: any) => {
          fullText += item.str + ' ';
        });
        setPageText(fullText);

        // Draw highlights on citation page - WRAPPED IN TRY-CATCH
        if (currentPage === citation.page_number && highlightCanvasRef.current) {
          try {
            const highlightCanvas = highlightCanvasRef.current;
            const highlightCtx = highlightCanvas.getContext('2d');
            
            // Match canvas dimensions
            highlightCanvas.height = viewport.height;
            highlightCanvas.width = viewport.width;
            
            if (highlightCtx) {
              // Clear previous highlights
              highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
              
              // Build full text with positions
              let currentPos = 0;
              const textItems: Array<{item: any, startPos: number, endPos: number}> = [];
              
              textContent.items.forEach((item: any) => {
                const str = item.str || '';
                textItems.push({
                  item: item,
                  startPos: currentPos,
                  endPos: currentPos + str.length
                });
                currentPos += str.length + 1; // +1 for space
              });
              
              // Improved matching: normalize and search for exact citation text
              const normalizeText = (text: string) => {
                return text.toLowerCase()
                  .replace(/\s+/g, ' ')  // Normalize whitespace
                  .replace(/[\r\n]+/g, ' ')  // Remove line breaks
                  .trim();
              };
              
              const citationText = normalizeText(citation.text || '');
              const fullTextNormalized = normalizeText(fullText);
              
              // Try to find the exact citation text
              let matchIndex = -1;
              if (citationText.length > 0) {
                matchIndex = fullTextNormalized.indexOf(citationText.substring(0, Math.min(100, citationText.length)));
                
                // If not found, try with smaller chunks (first 50 chars)
                if (matchIndex === -1 && citationText.length >= 50) {
                  matchIndex = fullTextNormalized.indexOf(citationText.substring(0, 50));
                }
                
                // If still not found, try just keywords
                if (matchIndex === -1 && citationText.length > 20) {
                  const keywords = citation.text.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
                  for (const keyword of keywords) {
                    const kwIndex = fullTextNormalized.indexOf(keyword.toLowerCase());
                    if (kwIndex !== -1) {
                      matchIndex = kwIndex;
                      break;
                    }
                  }
                }
              }
              
              if (matchIndex !== -1) {
                // Calculate match end based on actual citation length (cap at 300 chars for visibility)
                const matchLength = Math.min(citationText.length, 300);
                const matchEnd = matchIndex + matchLength;
                
                console.log('Highlighting:', { matchIndex, matchEnd, citationLength: citationText.length });
                
                // Highlight all text items that fall within the match range
                textItems.forEach(({item, startPos, endPos}) => {
                  try {
                    // Check if this text item overlaps with our match range
                    const overlaps = (startPos < matchEnd && endPos > matchIndex);
                    
                    if (overlaps && item.transform && Array.isArray(item.transform) && item.transform.length >= 6) {
                      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                      const x = tx[4];
                      const y = tx[5];
                      const height = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
                      const width = (item.width || 0) * viewport.scale;
                      
                      if (width > 0 && height > 0) {
                        // Draw highlight with bright yellow
                        highlightCtx.fillStyle = 'rgba(255, 235, 59, 0.5)';
                        highlightCtx.fillRect(x, y - height * 0.85, width, height);
                        
                        // Add a subtle border
                        highlightCtx.strokeStyle = 'rgba(255, 193, 7, 0.8)';
                        highlightCtx.lineWidth = 1;
                        highlightCtx.strokeRect(x, y - height * 0.85, width, height);
                      }
                    }
                  } catch (itemErr) {
                    // Ignore individual item errors
                    console.warn('Error highlighting text item:', itemErr);
                  }
                });
              } else {
                console.warn('Could not find citation text on page');
              }
            }
          } catch (highlightErr) {
            // Don't fail the entire render if highlighting fails
            console.error('Error during highlighting (non-fatal):', highlightErr);
          }
        }

      } catch (err) {
        console.error('Error rendering page:', err);
        // Only set error if it's not a cancellation
        if (err && (err as any).name !== 'RenderingCancelledException') {
          setError('Failed to render page');
        }
      } finally {
        isRenderingRef.current = false;
      }
    };

    renderPage();
    
    // Cleanup: cancel render on unmount
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore
        }
      }
      isRenderingRef.current = false;
    };
  }, [currentPage, scale, citation, renderKey]);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 2.5));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.8));
  const goToPrevPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage((prev) => Math.min(numPages, prev + 1));

  // Check if citation text is on current page
  const citationOnThisPage = currentPage === citation.page_number;
  const textIsVisible = citationOnThisPage && pageText.toLowerCase().includes(citation.text.toLowerCase().substring(0, 50));

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            📄 {citation.document_name}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Citation [{citation.citation_number}] • Page {citation.page_number}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
          aria-label="Close"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Citation Info Banner */}
      <div className="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-b border-yellow-200 dark:border-yellow-800 flex-shrink-0">
        <div className="flex items-start gap-2">
          <span className="text-2xl">✨</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-200 mb-1.5">
              Highlighted Passage:
            </p>
            <p className="text-sm text-yellow-800 dark:text-yellow-300 italic leading-relaxed">
              "{citation.text.substring(0, 200)}{citation.text.length > 200 ? '...' : ''}"
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
        {/* Page Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="px-3 py-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {currentPage}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400"> / {numPages}</span>
          </div>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            title="Zoom out"
          >
            <ZoomOutIcon className="h-4 w-4" />
          </button>
          <div className="px-3 py-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600 min-w-[70px] text-center">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <button
            onClick={zoomIn}
            className="p-2 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            title="Zoom in"
          >
            <ZoomInIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Highlight Indicator */}
      {citationOnThisPage && textIsVisible && (
        <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex-shrink-0">
          <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="font-medium">✓ Highlighted text is visible on this page</span>
          </p>
        </div>
      )}

      {/* PDF Canvas Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-black p-6"
      >
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Loading PDF...</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="text-red-500 text-4xl">⚠️</div>
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <div className="flex justify-center">
            <div className="relative inline-block shadow-2xl rounded-lg overflow-hidden bg-white">
              {/* PDF Canvas */}
              <canvas 
                ref={canvasRef} 
                className="block"
              />
              {/* Highlight Canvas Overlay */}
              <canvas
                ref={highlightCanvasRef}
                className="absolute top-0 left-0 pointer-events-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="font-semibold">Chars:</span> {citation.char_start}-{citation.char_end}
            </span>
            <span className="flex items-center gap-1">
              <span className="font-semibold">Chunk:</span> {citation.chunk_index}
            </span>
          </div>
          {citation.score && (
            <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-semibold">
              Score: {(citation.score * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
