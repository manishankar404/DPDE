import { Link } from "react-router-dom";
import Button from "../components/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft">
        <h2 className="text-2xl font-bold text-slate-900">Page Not Found</h2>
        <p className="mt-2 text-slate-600">The page you requested does not exist.</p>
        <div className="mt-5">
          <Link to="/">
            <Button type="button">Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

