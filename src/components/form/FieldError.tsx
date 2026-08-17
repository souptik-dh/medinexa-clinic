export default function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-error-500">{message}</p>;
}
