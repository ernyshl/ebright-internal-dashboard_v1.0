import { useNavigate } from 'react-router-dom';

export function BackButton({ to = '/', label = 'Back to Dashboard' }) {
  const navigate = useNavigate();

  return (
    <button
      className="btn btnGhost"
      onClick={() => navigate(to)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
    >
      <span style={{ fontSize: 16 }}>←</span>
      <span>{label}</span>
    </button>
  );
}
