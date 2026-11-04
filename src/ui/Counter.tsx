import { ORDERED } from "../data";
import { matches, useStore } from "../state/store";

export function Counter() {
  const year = useStore((s) => s.year);
  const cats = useStore((s) => s.cats);
  const query = useStore((s) => s.query);
  const f = { cats, query };
  const total = ORDERED.filter((s) => matches(s, f));
  const shown = total.filter((s) => s.year <= year).length;
  return (
    <div className="count" id="countOut">
      {shown} of {total.length} sites by {year}
    </div>
  );
}
