import React, { useRef } from 'react';
import { Upload, FileText } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div 
      className="w-full max-w-2xl mx-auto border-2 border-dashed border-sage-200 rounded-2xl p-12 text-center bg-white hover:bg-sage-50 transition-colors cursor-pointer group"
      onClick={() => inputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleChange} 
        className="hidden" 
        accept=".xml" 
      />
      
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-sage-100 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300 origin-center w-20 h-20 mx-auto" />
        <div className="relative z-10 w-20 h-20 bg-sage-50 rounded-full flex items-center justify-center mx-auto text-sage-600 shadow-sm border border-sage-100 group-hover:border-sage-200 transition-colors">
          <Upload size={32} />
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-slate-800 mb-2">
        Upload Sage EAS XML Export
      </h3>
      <p className="text-slate-500 mb-6">
        Click to browse your device for the .xml file.
      </p>
      
      <div className="flex items-center justify-center gap-2 text-xs text-sage-600 bg-sage-50 py-2 px-4 rounded-full w-fit mx-auto">
        <FileText size={14} />
        <span>Supports large XML files</span>
      </div>
    </div>
  );
};