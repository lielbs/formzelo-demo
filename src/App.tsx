import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ProductionRouteBoundary } from './auth/ProductionRouteBoundary';
import { Spinner } from './components/ui';
import { applyRouteMeta, pageTitle } from './lib/meta';
import { NotFound } from './pages/NotFound';
import { PublicFlow } from './pages/PublicFlow';

// The public customer flow is bundled eagerly so shared links load fast on mobile;
// owner-facing pages (and Recharts) are split into their own chunks.
const named = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const AppLayout = named(() => import('./components/AppLayout'), 'AppLayout');
const Landing = named(() => import('./pages/Landing'), 'Landing');
const Demo = named(() => import('./pages/Demo'), 'Demo');
const Pricing = named(() => import('./pages/Pricing'), 'Pricing');
const Themes = named(() => import('./pages/Themes'), 'Themes');
const Tour = named(() => import('./pages/Tour'), 'Tour');
const Privacy = named(() => import('./pages/Privacy'), 'Privacy');
const Dashboard = named(() => import('./pages/app/Dashboard'), 'Dashboard');
const WorkflowList = named(() => import('./pages/app/WorkflowList'), 'WorkflowList');
const WorkflowNew = named(() => import('./pages/app/WorkflowNew'), 'WorkflowNew');
const WorkflowEditor = named(() => import('./pages/app/WorkflowEditor'), 'WorkflowEditor');
const Requests = named(() => import('./pages/app/Requests'), 'Requests');
const RequestDetail = named(() => import('./pages/app/RequestDetail'), 'RequestDetail');
const Analytics = named(() => import('./pages/app/Analytics'), 'Analytics');
const Settings = named(() => import('./pages/app/Settings'), 'Settings');
const BrandKitPage = named(() => import('./pages/app/BrandKit'), 'BrandKitPage');
const InviteAccept = named(() => import('./pages/InviteAccept'), 'InviteAccept');

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const title = pageTitle(pathname);
    if (title) document.title = title;
    applyRouteMeta(pathname);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/themes" element={<Themes />} />
          <Route path="/tour" element={<Tour />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/invite" element={<InviteAccept />} />
          <Route path="/f/:slug" element={<PublicFlow />} />
          <Route path="/app" element={<ProductionRouteBoundary><AppLayout /></ProductionRouteBoundary>}>
            <Route index element={<Dashboard />} />
            <Route path="workflows" element={<WorkflowList />} />
            <Route path="workflows/new" element={<WorkflowNew />} />
            <Route path="workflows/:id" element={<WorkflowEditor />} />
            <Route path="requests" element={<Requests />} />
            <Route path="requests/:id" element={<RequestDetail />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="brand" element={<BrandKitPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
