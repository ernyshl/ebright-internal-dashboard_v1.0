import { useState } from 'react';

export function GAEmbed({ title, reportUrl, height = '500px' }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="card">
        <div className="cardHeader">
          <h3>{title}</h3>
        </div>
        <div className="gaEmbedError">
          <div className="gaEmbedErrorIcon">🔒</div>
          <h4>Google Analytics cannot be embedded directly</h4>
          <p>Google Analytics reports cannot be displayed in an iframe due to security restrictions.</p>
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btnPrimary"
          >
            Open in Google Analytics ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="cardHeader">
        <h3>{title}</h3>
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btnGhost btnSmall"
        >
          Open in GA ↗
        </a>
      </div>
      <div className="gaEmbedContainer" style={{ height }}>
        {isLoading && (
          <div className="gaEmbedLoading">
            <div className="loadingDots"><span /><span /><span /></div>
            <p>Loading Google Analytics...</p>
          </div>
        )}
        <iframe
          src={reportUrl}
          className="gaEmbedIframe"
          style={{ height }}
          onLoad={() => setIsLoading(false)}
          onError={() => setHasError(true)}
          title={title}
        />
      </div>
    </div>
  );
}