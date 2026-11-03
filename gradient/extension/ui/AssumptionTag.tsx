interface AssumptionTagProps {
  value: string | number;
  assumption: string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export function AssumptionTag({
  value,
  assumption,
  className = '',
  prefix = '',
  suffix = '',
}: AssumptionTagProps) {
  return (
    <span
      class={`assumption-val ${className}`}
      title={`Assumption: ${assumption}`}
      aria-label={`${value} (Assumption: ${assumption})`}
      tabIndex={0}
    >
      {prefix}
      {value}
      {suffix}
    </span>
  );
}
