import { useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { pdfToImage } from '../../utils/pdfConverter';
import { logger } from '../../logger';

export default function FloorPlanUpload({ onUploadComplete, currentFloorPlan }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      logger.error('FloorPlan', 'Invalid file type:', file.type);
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setError('File size must be less than 50MB');
      logger.error('FloorPlan', 'File too large:', file.size);
      return;
    }

    setUploading(true);
    setError(null);
    logger.info('FloorPlan', 'Converting PDF to image:', file.name);

    try {
      const imageData = await pdfToImage(file);
      logger.info('FloorPlan', 'PDF converted successfully');
      onUploadComplete({
        image: imageData,
        filename: file.name,
        uploadedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('PDF conversion error:', err);
      logger.error('FloorPlan', 'PDF conversion failed:', err.message, err.stack);
      setError(`Failed to convert PDF: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    logger.info('FloorPlan', 'Floor plan removed');
    onUploadComplete(null);
    setError(null);
  };

  if (currentFloorPlan) {
    return (
      <div style={{
        padding: '16px',
        backgroundColor: '#0d1117',
        borderRadius: '8px',
        border: '2px solid #06b6d4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileText size={24} color="#06b6d4" />
          <div>
            <div style={{ fontSize: '14px', color: '#e6edf3', fontWeight: '600' }}>
              {currentFloorPlan.filename}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7785', marginTop: '4px' }}>
              Uploaded {new Date(currentFloorPlan.uploadedAt).toLocaleString()}
            </div>
          </div>
        </div>
        <button
          onClick={handleRemove}
          style={{
            padding: '8px',
            backgroundColor: '#1a2332',
            border: '1px solid #2d3748',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={20} color="#ef4444" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor="floor-plan-upload"
        style={{
          display: 'block',
          padding: '48px 24px',
          backgroundColor: '#0d1117',
          borderRadius: '8px',
          border: '2px dashed #2d3748',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          opacity: uploading ? 0.6 : 1
        }}
      >
        <Upload size={48} color="#06b6d4" style={{ margin: '0 auto 16px auto' }} />
        <div style={{ fontSize: '16px', color: '#e6edf3', fontWeight: '600', marginBottom: '8px' }}>
          {uploading ? 'Converting PDF...' : 'Upload Venue Floor Plan'}
        </div>
        <div style={{ fontSize: '14px', color: '#6b7785', marginBottom: '16px' }}>
          PDF files up to 50MB • First page will be used
        </div>
        {!uploading && (
          <div style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#06b6d4',
            color: '#0a0e14',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            Choose PDF File
          </div>
        )}
        <input
          id="floor-plan-upload"
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          backgroundColor: '#2d1515',
          border: '1px solid #ef4444',
          borderRadius: '6px',
          color: '#ef4444',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
