export function FlareProcurementSignal() {
  return (
    <svg
      className="flare-signal-illustration"
      viewBox="0 0 560 420"
      role="img"
      aria-labelledby="flare-signal-title flare-signal-description"
    >
      <title id="flare-signal-title">Private bids produce a threshold-signed award</title>
      <desc id="flare-signal-description">
        Three sealed bid envelopes enter three fixed TEE machines. Two matching
        signatures unlock one public FTestXRP award while losing bids remain sealed.
      </desc>
      <path className="flare-signal-orbit" d="M48 211c74-142 382-151 467-10" />
      <path className="flare-signal-orbit flare-signal-orbit-lower" d="M55 248c95 126 361 124 454-8" />

      <g className="flare-signal-bid flare-signal-bid-one">
        <rect x="32" y="92" width="105" height="70" rx="12" />
        <path d="m34 96 50 38 50-38" />
        <circle cx="84" cy="134" r="13" />
        <path d="M78 134h12M84 128v12" />
      </g>
      <g className="flare-signal-bid flare-signal-bid-two">
        <rect x="27" y="183" width="105" height="70" rx="12" />
        <path d="m29 187 50 38 50-38" />
        <circle cx="79" cy="225" r="13" />
        <path d="M73 225h12M79 219v12" />
      </g>
      <g className="flare-signal-bid flare-signal-bid-three">
        <rect x="42" y="274" width="105" height="70" rx="12" />
        <path d="m44 278 50 38 50-38" />
        <circle cx="94" cy="316" r="13" />
        <path d="M88 316h12M94 310v12" />
      </g>

      <g className="flare-signal-aperture">
        <path d="M205 72h164l67 139-67 139H205l-67-139Z" />
        <path d="M229 111h116l48 100-48 100H229l-48-100Z" />
        <circle cx="287" cy="211" r="59" />
        <path d="M269 211h36M287 193v36" />
      </g>

      {[0, 1, 2].map((index) => (
        <g className={`flare-signal-tee flare-signal-tee-${index + 1}`} key={index}>
          <circle cx={221 + index * 66} cy="211" r="25" />
          <path d={`M${211 + index * 66} 211h20M${221 + index * 66} 201v20`} />
          <text x={221 + index * 66} y="252" textAnchor="middle">TEE {index + 1}</text>
        </g>
      ))}

      <g className="flare-signal-award">
        <path d="M421 147h104v128H421Z" />
        <path d="m438 147 35-29 35 29" />
        <circle cx="473" cy="205" r="28" />
        <path d="m459 205 10 10 20-23" />
        <text x="473" y="301" textAnchor="middle">2 / 3 SIGNED</text>
      </g>
      <text className="flare-signal-caption" x="28" y="389">
        SEALED INGRESS · FIXED QUORUM · PUBLIC SETTLEMENT
      </text>
    </svg>
  );
}

export function FlareLifecycleMarquee() {
  return (
    <div className="flare-lifecycle-marquee" aria-label="FlareQuorum lifecycle">
      <span>XRPL + FDC FUNDING</span><b aria-hidden="true">→</b>
      <span>FTESTXRP ESCROW</span><b aria-hidden="true">→</b>
      <span>PRIVATE FCC BIDS</span><b aria-hidden="true">→</b>
      <span>FTSO SNAPSHOT</span><b aria-hidden="true">→</b>
      <span>2-OF-3 AWARD</span>
    </div>
  );
}
