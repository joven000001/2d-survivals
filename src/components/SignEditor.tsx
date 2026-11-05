import React, { useState } from 'react';
import { Signpost } from 'lucide-react';
import { InteractiveObjectState } from '../game/worldObjects';

export const SignEditor: React.FC<{ object: InteractiveObjectState; onSave: (text: string) => void; onClose: () => void }> = ({ object, onSave, onClose }) => {
  const [text, setText] = useState(object.text ?? '');
  return <div className="absolute inset-0 z-[60] grid place-items-center bg-slate-950/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Edit sign" className="w-full max-w-sm rounded-xl border-2 border-amber-200/70 bg-[#243c38] p-4 shadow-xl">
      <h2 className="mb-3 flex items-center gap-2 font-pixel text-sm text-amber-100"><Signpost size={16} aria-hidden="true" />SIGN</h2>
      <textarea aria-label="Sign text" maxLength={180} value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full resize-none rounded-lg border border-amber-100/30 bg-[#142a29] p-3 font-mono text-sm text-white outline-none focus:border-amber-200" placeholder="Write a message…" />
      <div className="mt-3 flex items-center justify-between text-xs text-emerald-100/70"><span>{text.length}/180 characters</span><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-white/20 px-3 py-2">Cancel</button><button type="button" onClick={() => onSave(text)} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950">Save sign</button></div></div>
    </section>
  </div>;
};
