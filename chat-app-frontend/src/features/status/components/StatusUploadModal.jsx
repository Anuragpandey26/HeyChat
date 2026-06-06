import React, { useState } from 'react';
import { useStatusStore } from '../store/useStatusStore.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Textarea } from '../../../shared/components/ui/Textarea.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';

const BG_PRESETS = [
  '#0f172a', // Slate
  '#065f46', // Emerald
  '#3730a3', // Indigo
  '#6b21a8', // Purple
  '#9f1239', // Rose
  '#9a3412', // Orange
];

export const StatusUploadModal = ({ isOpen, onClose }) => {
  const { uploadStatus, isLoading } = useStatusStore();
  const [content, setContent] = useState('');
  const [bg, setBg] = useState(BG_PRESETS[0]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [error, setError] = useState('');

  const handleImageChange = (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image exceeds 5 MB size limit');
      return;
    }

    setImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const handleClearImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview('');
  };

  const handleClose = () => {
    handleClearImage();
    setContent('');
    setBg(BG_PRESETS[0]);
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!imageFile && !content.trim()) {
      setError('Status text is required');
      return;
    }

    if (content.length > 139) {
      setError('Status updates are capped at 139 characters.');
      return;
    }

    try {
      if (imageFile) {
        await uploadStatus(content, 'IMAGE', null, imageFile);
      } else {
        await uploadStatus(content, 'TEXT', bg);
      }
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to upload status.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Status Update" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-2.5 bg-red-950/50 border border-red-800 rounded-lg text-xs font-semibold text-red-400">
            {error}
          </div>
        )}

        {/* Live Preview area */}
        <div
          style={imagePreview ? {} : { backgroundColor: bg }}
          className="w-full h-48 rounded-2xl flex items-center justify-center p-6 text-center shadow-inner relative overflow-hidden transition-colors duration-300 border border-slate-800/40 bg-slate-950"
        >
          {imagePreview ? (
            <>
              <img
                src={imagePreview}
                alt="Status Preview"
                className="absolute inset-0 w-full h-full object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-black/45" />
              <p className="text-sm font-bold text-white leading-relaxed break-words max-w-full relative z-10 px-4">
                {content || <span className="text-white/40 italic">Add a caption...</span>}
              </p>
              <button
                type="button"
                onClick={handleClearImage}
                className="absolute top-2.5 right-2.5 px-2 py-1 bg-red-950/80 hover:bg-red-900/80 border border-red-800 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors z-20"
              >
                Remove Photo
              </button>
            </>
          ) : (
            <p className="text-base font-bold text-white leading-relaxed break-words max-w-full">
              {content || <span className="text-white/40 italic">Type status preview...</span>}
            </p>
          )}
          <span className="absolute bottom-3 right-3 text-[10px] text-white/50 z-10">
            {content.length}/139
          </span>
        </div>

        <Textarea
          placeholder={imagePreview ? "Add a caption... (Max 139 chars)" : "What's on your mind? (Max 139 chars)"}
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 139))}
          rows={3}
        />

        {/* Add photo option */}
        {!imagePreview && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Add Photo
            </label>
            <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-900 border border-slate-850 hover:bg-slate-800 hover:border-slate-700 cursor-pointer rounded-xl text-xs font-bold text-slate-350 hover:text-white transition-all shadow-sm">
              <span className="text-sm">📷</span> Choose an Image (Max 5MB)
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Color presets */}
        {!imagePreview && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Background Color
            </label>
            <div className="flex gap-2">
              {BG_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBg(color)}
                  style={{ backgroundColor: color }}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    bg === color ? 'border-white scale-110 shadow-md' : 'border-transparent hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <Button type="submit" isLoading={isLoading} className="w-full mt-1">
          Share Update
        </Button>
      </form>
    </Modal>
  );
};
