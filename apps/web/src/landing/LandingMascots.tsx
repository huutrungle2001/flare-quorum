type MascotProps = {
  className?: string;
};

export function VeilScoutMascot({ className = "" }: MascotProps) {
  return (
    <svg
      className={`landing-mascot-svg ${className}`}
      viewBox="0 0 320 260"
      aria-hidden="true"
      focusable="false"
    >
      <path className="mascot-orbit" d="M35 166c34 54 198 77 252-7" />
      <circle className="mascot-spark mascot-spark-one" cx="45" cy="70" r="8" />
      <path className="mascot-spark mascot-spark-two" d="m276 43 5 11 11 5-11 5-5 11-5-11-11-5 11-5Z" />
      <g className="mascot-float">
        <path className="mascot-fill-dark" d="M78 166c0-53 33-97 82-97s82 44 82 97v52H78Z" />
        <path className="mascot-fill-green" d="M102 168c0-42 23-75 58-75s58 33 58 75v50H102Z" />
        <path className="mascot-fill-paper" d="M119 94c10-20 71-20 82 0v57c-5 22-76 22-82 0Z" />
        <circle className="mascot-eye mascot-eye-left" cx="143" cy="125" r="5" />
        <circle className="mascot-eye mascot-eye-right" cx="177" cy="125" r="5" />
        <path className="mascot-line" d="M148 143c8 7 17 7 25 0" />
        <path className="mascot-line" d="M107 172 73 151M213 171l35-26" />
        <g className="mascot-envelope">
          <rect className="mascot-fill-paper" x="224" y="117" width="66" height="48" rx="3" />
          <path className="mascot-line" d="m225 120 32 24 32-24" />
          <circle className="mascot-fill-green" cx="257" cy="145" r="10" />
          <path className="mascot-line" d="M253 145h8M257 141v8" />
        </g>
        <rect className="mascot-fill-paper" x="136" y="176" width="48" height="31" rx="3" />
        <path className="mascot-line" d="M149 176v-7a11 11 0 0 1 22 0v7M160 188v7" />
      </g>
      <text className="mascot-label" x="36" y="238">SEALED BY DEFAULT</text>
    </svg>
  );
}

export function NoxOrbMascot({ className = "" }: MascotProps) {
  return (
    <svg
      className={`landing-mascot-svg ${className}`}
      viewBox="0 0 300 220"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="mascot-orbit mascot-orbit-spin" cx="150" cy="111" rx="124" ry="67" />
      <g className="mascot-bid-card mascot-card-one">
        <rect className="mascot-fill-paper" x="20" y="62" width="58" height="44" rx="3" />
        <circle className="mascot-fill-dark" cx="39" cy="84" r="4" />
        <circle className="mascot-fill-dark" cx="49" cy="84" r="4" />
        <circle className="mascot-fill-dark" cx="59" cy="84" r="4" />
      </g>
      <g className="mascot-bid-card mascot-card-two">
        <rect className="mascot-fill-paper" x="222" y="118" width="58" height="44" rx="3" />
        <circle className="mascot-fill-dark" cx="241" cy="140" r="4" />
        <circle className="mascot-fill-dark" cx="251" cy="140" r="4" />
        <circle className="mascot-fill-dark" cx="261" cy="140" r="4" />
      </g>
      <g className="mascot-float mascot-orb-body">
        <circle className="mascot-fill-dark" cx="150" cy="108" r="67" />
        <path className="mascot-fill-green" d="M103 106c14-39 80-39 94 0v35c-20 25-74 25-94 0Z" />
        <circle className="mascot-eye mascot-eye-left" cx="132" cy="116" r="5" />
        <circle className="mascot-eye mascot-eye-right" cx="168" cy="116" r="5" />
        <path className="mascot-line mascot-line-paper" d="M139 137h22" />
        <path className="mascot-line mascot-line-paper" d="m126 67 24-17 24 17" />
        <rect className="mascot-fill-paper" x="135" y="75" width="30" height="23" rx="2" />
        <path className="mascot-line" d="M143 75v-5a7 7 0 0 1 14 0v5M150 84v6" />
      </g>
      <text className="mascot-label" x="82" y="207">COMPARE · PROVE · SETTLE</text>
    </svg>
  );
}

export function TreasuryCrewMascot({ className = "" }: MascotProps) {
  return (
    <svg
      className={`landing-mascot-svg ${className}`}
      viewBox="0 0 300 220"
      aria-hidden="true"
      focusable="false"
    >
      <path className="mascot-orbit" d="M37 174c40 28 188 30 226-4" />
      <g className="mascot-owner mascot-owner-one">
        <circle className="mascot-fill-green" cx="54" cy="72" r="24" />
        <circle className="mascot-fill-dark" cx="47" cy="70" r="3" />
        <circle className="mascot-fill-dark" cx="61" cy="70" r="3" />
      </g>
      <g className="mascot-owner mascot-owner-two">
        <circle className="mascot-fill-green" cx="246" cy="72" r="24" />
        <circle className="mascot-fill-dark" cx="239" cy="70" r="3" />
        <circle className="mascot-fill-dark" cx="253" cy="70" r="3" />
      </g>
      <g className="mascot-owner mascot-owner-three">
        <circle className="mascot-fill-paper" cx="150" cy="35" r="24" />
        <circle className="mascot-fill-dark" cx="143" cy="33" r="3" />
        <circle className="mascot-fill-dark" cx="157" cy="33" r="3" />
      </g>
      <path className="mascot-line" d="M72 79 98 94M228 79l-26 15M150 59v23" />
      <g className="mascot-float mascot-vault">
        <rect className="mascot-fill-dark" x="91" y="78" width="118" height="108" rx="8" />
        <rect className="mascot-fill-paper" x="107" y="94" width="86" height="76" rx="4" />
        <circle className="mascot-fill-green" cx="150" cy="132" r="24" />
        <circle className="mascot-line" cx="150" cy="132" r="13" />
        <path className="mascot-line" d="M150 119v26M137 132h26" />
        <circle className="mascot-fill-green" cx="194" cy="91" r="12" />
        <path className="mascot-line" d="m188 91 4 4 8-9" />
      </g>
      <text className="mascot-label" x="82" y="209">OWNERS APPROVE · SAFE PAYS</text>
    </svg>
  );
}
