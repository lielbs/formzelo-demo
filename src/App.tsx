import { runtimeConfiguration } from './production/runtime';
import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { ProductionRouteBoundary } from './auth/ProductionRouteBoundary';
import { PageLoader } from './components/ui';
import { applyRouteMeta, pageTitle } from './lib/meta';
import { NotFound } from './pages/NotFound';
import { TablesRoot } from './tables/theme';

// Every screen is its own chunk. The customer form (with its design themes and fonts, the heaviest
// CSS) loads only on form links, so the app, Tables and booking pages start lighter.
const named = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const AppLayout = named(() => import('./components/AppLayout'), 'AppLayout');
const PublicFlow = named(() => import('./pages/PublicFlow'), 'PublicFlow');
const Track = named(() => import('./pages/Track'), 'Track');
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
const Operator = named(() => import('./pages/Operator'), 'Operator');
const ResetPassword = named(() => import('./pages/ResetPassword'), 'ResetPassword');
// Formangle Tables: owner, host and guest bundles are separate chunks.
const TablesHome = named(() => import('./tables/owner/TablesHome'), 'TablesHome');
const VenueOverview = named(() => import('./tables/owner/VenueOverview'), 'VenueOverview');
const VenueSetup = named(() => import('./tables/owner/VenueSetup'), 'VenueSetup');
const MenusPage = named(() => import('./tables/owner/MenusPage'), 'MenusPage');
const AnalyticsPage = named(() => import('./tables/owner/AnalyticsPage'), 'AnalyticsPage');
const HostShift = named(() => import('./tables/host/HostShift'), 'HostShift');
const BookingPage = named(() => import('./tables/public/BookingPage'), 'BookingPage');
const ManagePage = named(() => import('./tables/public/ManagePage'), 'ManagePage');
const WaitlistJoinPage = named(() => import('./tables/public/WaitlistPages'), 'WaitlistJoinPage');
const WaitlistStatusPage = named(() => import('./tables/public/WaitlistPages'), 'WaitlistStatusPage');
const MenuPage = named(() => import('./tables/public/MenuPage'), 'MenuPage');
const PagePreview = named(() => import('./tables/public/PagePreview'), 'PagePreview');
const PublicPagesStudio = named(() => import('./tables/owner/PublicPagesStudio'), 'PublicPagesStudio');

/** Tables needs the real server: in the local demo these routes show the not-found page instead of simulating. */
const live = (el: JSX.Element, owner = false) => (runtimeConfiguration.mode === 'production' ? <TablesRoot owner={owner}>{el}</TablesRoot> : <NotFound />);

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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={runtimeConfiguration.mode === 'production' ? <Navigate to="/app" replace /> : <Landing />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/themes" element={<Themes />} />
          <Route path="/tour" element={<Tour />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/invite" element={<InviteAccept />} />
          <Route path="/operator" element={<Operator />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/f/:slug" element={<PublicFlow />} />
          <Route path="/track" element={<Track />} />
          <Route path="/t/r" element={live(<ManagePage />)} />
          <Route path="/t/w" element={live(<WaitlistStatusPage />)} />
          <Route path="/t/:slug" element={live(<BookingPage />)} />
          <Route path="/t/:slug/menu" element={live(<MenuPage />)} />
          <Route path="/t/:slug/waitlist" element={live(<WaitlistJoinPage />)} />
          <Route path="/t-preview" element={live(<PagePreview />)} />
          <Route path="/app/tables/:venueId/live" element={live(<ProductionRouteBoundary><HostShift /></ProductionRouteBoundary>)} />
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
            <Route path="tables" element={live(<TablesHome />, true)} />
            <Route path="tables/:venueId" element={live(<VenueOverview />, true)} />
            <Route path="tables/:venueId/setup" element={live(<VenueSetup />, true)} />
            <Route path="tables/:venueId/menus" element={live(<MenusPage />, true)} />
            <Route path="tables/:venueId/design" element={live(<PublicPagesStudio />, true)} />
            <Route path="tables/:venueId/analytics" element={live(<AnalyticsPage />, true)} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
