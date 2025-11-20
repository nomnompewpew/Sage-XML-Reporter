import React, { useState, useCallback } from 'react';
import { 
  FileText, 
  Settings, 
  CheckCircle, 
  Download, 
  AlertCircle, 
  ArrowRight,
  Database,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { AppStep, SchemaMapping, ProcessingResult } from './types';
import { analyzeXMLSchema } from './services/geminiService';
import { processXMLFile } from './services/processingService';
import { FileUpload } from './components/FileUpload';
import { Button } from './components/Button';

// Placeholder imports for libraries that would normally be installed
// In a real env, these would be imported from node_modules
// We assume standard globals or bundler handling for this demo

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.UPLOAD);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<SchemaMapping | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 1. Handle File Selection & Initial AI Analysis
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setError(null);
    
    try {
      // Read first 4KB to get a good snippet for the AI
      const text = await selectedFile.slice(0, 4000).text();
      
      // Call Gemini to detect schema
      const detectedMapping = await analyzeXMLSchema(text);
      setMapping(detectedMapping);
      setCurrentStep(AppStep.ANALYZE);
    } catch (err) {
      setError("Failed to analyze XML structure. Please ensure the file is valid XML.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Proceed to Processing (after user confirms mapping)
  const handleStartProcessing = async () => {
    if (!file || !mapping) return;
    
    setLoading(true);
    setCurrentStep(AppStep.PROCESSING);
    
    // Give UI a moment to update before heavy lifting
    setTimeout(async () => {
      try {
        const result = await processXMLFile(file, mapping);
        setProcessingResult(result);
        setCurrentStep(AppStep.COMPLETE);
      } catch (err) {
        setError("Error processing file. " + (err as Error).message);
        setCurrentStep(AppStep.ANALYZE);
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  // 3. Download Handler
  const handleDownload = () => {
    if (!processingResult) return;
    
    const url = URL.createObjectURL(processingResult.zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sage_Reports_Export_${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setMapping(null);
    setProcessingResult(null);
    setCurrentStep(AppStep.UPLOAD);
    setError(null);
  };

  // -- Sub-Components for Steps --

  const renderAnalyzeStep = () => (
    <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-100 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-sage-100 text-sage-700 rounded-lg">
          <Settings size={24} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Review Mapping</h2>
      </div>
      
      <p className="text-slate-600 mb-6">
        We analyzed <strong>{file?.name}</strong> using Gemini AI. Here is the proposed structure for the Excel conversion.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Database size={14} /> Structure
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block">Root Element</label>
              <code className="text-sage-700 font-mono bg-sage-50 px-1 rounded">{mapping?.rootElement}</code>
            </div>
            <div>
              <label className="text-xs text-slate-400 block">Row Element</label>
              <code className="text-sage-700 font-mono bg-sage-50 px-1 rounded">{mapping?.rowElement}</code>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
           <h3 className="text-sm font-semibold text-slate-50 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Calendar size={14} /> Split Logic
          </h3>
           <div>
              <label className="text-xs text-slate-400 block">Date Field (for monthly split)</label>
              <code className="text-amber-700 font-mono bg-amber-50 px-1 rounded border border-amber-100">{mapping?.dateField}</code>
            </div>
            <div className="mt-3">
              <label className="text-xs text-slate-400 block">Columns to Export ({mapping?.fieldsToExport.length})</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {mapping?.fieldsToExport.slice(0, 5).map(f => (
                   <span key={f} className="text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">{f}</span>
                ))}
                {(mapping?.fieldsToExport.length || 0) > 5 && <span className="text-xs text-slate-400">+{mapping!.fieldsToExport.length - 5} more</span>}
              </div>
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={reset}>Cancel</Button>
        <Button onClick={handleStartProcessing} isLoading={loading}>
          Confirm & Process <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );

  const renderProcessing = () => (
     <div className="text-center max-w-md mx-auto py-12">
        <div className="relative w-24 h-24 mx-auto mb-8">
           <div className="absolute inset-0 border-4 border-sage-100 rounded-full"></div>
           <div className="absolute inset-0 border-4 border-sage-500 border-t-transparent rounded-full animate-spin"></div>
           <Database className="absolute inset-0 m-auto text-sage-600 animate-pulse" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Processing XML...</h2>
        <p className="text-slate-500">
          Parsing records, grouping by month, and generating Excel workbooks. This happens locally in your browser.
        </p>
     </div>
  );

  const renderComplete = () => (
    <div className="bg-white rounded-xl p-8 shadow-lg border border-sage-100 max-w-2xl mx-auto text-center">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle size={40} />
      </div>
      
      <h2 className="text-3xl font-bold text-slate-800 mb-2">Success!</h2>
      <p className="text-slate-600 mb-8">
        Your Sage EAS XML has been successfully converted.
      </p>
      
      <div className="grid grid-cols-3 gap-4 mb-8 text-left">
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl font-bold text-slate-800">{processingResult?.stats.totalRows.toLocaleString()}</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Total Rows</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl font-bold text-slate-800">{processingResult?.stats.filesCreated}</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Excel Files</div>
        </div>
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="text-2xl font-bold text-slate-800">{processingResult?.stats.monthsFound.length}</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Months</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button variant="outline" onClick={reset}>
           <RefreshCw size={16} /> Process Another
        </Button>
        <Button onClick={handleDownload} className="w-full sm:w-auto">
          <Download size={18} /> Download ZIP
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <header className="max-w-5xl mx-auto mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sage-600 rounded-lg flex items-center justify-center shadow-lg shadow-sage-200">
            <FileText className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sage EAS Converter</h1>
            <p className="text-xs text-slate-500 font-medium">XML to Monthly Excel Reports</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto relative">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700"
            >
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <p>{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 font-bold">&times;</button>
            </motion.div>
          )}

          {currentStep === AppStep.UPLOAD && (
             <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
             >
               <div className="text-center mb-10">
                 <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Simplify Your Sage Reporting</h2>
                 <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                   Transform messy XML exports into organized, month-by-month Excel reports instantly. 
                   Secure, client-side processing with AI-powered schema detection.
                 </p>
               </div>
               
               {loading ? (
                 <div className="max-w-2xl mx-auto p-12 bg-white rounded-2xl shadow-sm border border-slate-100 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-sage-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-slate-600">Analyzing file structure with Gemini AI...</p>
                 </div>
               ) : (
                 <FileUpload onFileSelect={handleFileSelect} />
               )}
             </motion.div>
          )}

          {currentStep === AppStep.ANALYZE && (
            <motion.div
              key="analyze"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {renderAnalyzeStep()}
            </motion.div>
          )}

          {currentStep === AppStep.PROCESSING && (
             <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
             >
               {renderProcessing()}
             </motion.div>
          )}

          {currentStep === AppStep.COMPLETE && (
             <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
             >
               {renderComplete()}
             </motion.div>
          )}
        </AnimatePresence>
      </main>
      
      <footer className="max-w-5xl mx-auto mt-20 text-center border-t border-slate-200 pt-8">
        <p className="text-slate-400 text-sm">
          &copy; {new Date().getFullYear()} Sage EAS Converter. Powered by Gemini 2.5 Flash.
        </p>
      </footer>
    </div>
  );
};

export default App;