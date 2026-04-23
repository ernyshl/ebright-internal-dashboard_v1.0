export default function DeleteConfirmModal({ student, onClose, onConfirm }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:400 }}>
        <div style={{ padding:24, textAlign:'center' }}>
          <div style={{ width:48, height:48, background:'rgba(239,68,68,0.1)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:24 }}>🗑️</div>
          <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>Delete Student?</h2>
          <p style={{ fontSize:13, color:'var(--muted)', margin:0 }}>
            Are you sure you want to delete <strong style={{ color:'var(--text)' }}>{student.name}</strong>? This action cannot be undone.
          </p>
        </div>
        <div style={{ padding:'0 24px 24px', display:'flex', gap:12 }}>
          <button onClick={onClose} style={{ flex:1, fontSize:13, padding:'10px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer', fontWeight:500 }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex:1, fontSize:13, padding:'10px 16px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', cursor:'pointer', fontWeight:600 }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
