export default function ArchiveConfirmModal({ student, onClose, onConfirm }: any) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:420 }}>
        <div style={{ padding:24, textAlign:'center' }}>
          <div style={{ width:48, height:48, background:'rgba(245,158,11,0.12)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:24 }}>📦</div>
          <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>Archive Student?</h2>
          <p style={{ fontSize:13, color:'var(--muted)', margin:0, lineHeight:1.5 }}>
            Move <strong style={{ color:'var(--text)' }}>{student.name}</strong> to Archived Students?
            <br />
            <span style={{ fontSize:12 }}>Grade, Chapter, FA and PCM progress are preserved and can be restored anytime.</span>
          </p>
        </div>
        <div style={{ padding:'0 24px 24px', display:'flex', gap:12 }}>
          <button onClick={onClose} style={{ flex:1, fontSize:13, padding:'10px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer', fontWeight:500 }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex:1, fontSize:13, padding:'10px 16px', borderRadius:8, border:'none', background:'#f59e0b', color:'#fff', cursor:'pointer', fontWeight:600 }}>
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
