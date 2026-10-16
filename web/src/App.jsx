import { useEffect } from 'react';
import { Ban, LogOut, Settings } from 'lucide-react';
import AppShell from './app/AppShell.jsx';
import AuthScreen from './features/auth/AuthScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ExitPrompt from './components/ExitPrompt.jsx';
import Spinner from './components/Spinner.jsx';
import Button from './components/ui/Button.jsx';
import Card from './components/ui/Card.jsx';
import Logo from './components/ui/Logo.jsx';
import UpdateNotification from './components/UpdateNotification.jsx';
import InstallBanner from './components/InstallBanner.jsx';
import { useAuth } from './state/AuthContext.jsx';
import { JourneyProvider } from './state/JourneyContext.jsx';
import { TransactionsProvider } from './state/TransactionsContext.jsx';
import { GoalsProvider } from './state/GoalsContext.jsx';
import { HabitsProvider } from './state/HabitsContext.jsx';
import { warmUp } from './services/api.js';

/**
 * Auth guard. Nothing past this point renders without a signed-in, non-suspended user; each user
 * gets their own JourneyProvider (keyed by id) so data never leaks between accounts on one device.
 */
function Guarded() {
  const { status, user, backend, recovery, configError } = useAuth();

  if (status === 'loading') return <Spinner fullScreen />;
  if (status === 'unconfigured') {
    return (
      <Notice
        icon={Settings}
        title="נדרשת הגדרה"
        body={
          configError
            ? 'הגדרות שירות ההתחברות בגרסה הזו שגויות, ולכן אי אפשר להתחבר. מנהל המערכת צריך לתקן אותן ולפרסם מחדש.'
            : 'שירות ההתחברות לא הוגדר בגרסה הזו. מנהל המערכת צריך להגדיר את VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY ולפרסם מחדש.'
        }
      >
        {configError && (
          <p dir="ltr" className="mt-4 break-words rounded-2xl bg-mist p-3 text-start font-mono text-xs text-navy-soft">
            {configError}
          </p>
        )}
      </Notice>
    );
  }
  if (recovery) return <AuthScreen initialMode="recovery" />;
  if (status !== 'signedIn' || !user) return <AuthScreen />;
  if (user.suspended) return <Suspended />;

  return (
    <JourneyProvider key={user.id} userId={user.id} backend={backend}>
      <TransactionsProvider key={user.id} userId={user.id} backend={backend}>
        <GoalsProvider key={user.id} userId={user.id} backend={backend}>
          <HabitsProvider key={user.id} userId={user.id} backend={backend}>
            <AppShell />
          </HabitsProvider>
        </GoalsProvider>
      </TransactionsProvider>
    </JourneyProvider>
  );
}

function Suspended() {
  const { signOut } = useAuth();
  return (
    <Notice icon={Ban} title="החשבון הושעה" body="הגישה לחשבון הזה הושעתה על ידי מנהל המערכת. לבירור, פנו למנהל.">
      <Button variant="secondary" className="mt-6 w-full" onClick={signOut}>
        <LogOut size={18} /> התנתקות
      </Button>
    </Notice>
  );
}

function Notice({ icon: Icon, title, body, children }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 safe-x">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size={36} />
        </div>
        <Card padding="p-6 sm:p-8" className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mist text-navy">
            <Icon size={26} />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-navy">{title}</h1>
          <p className="mt-2 leading-relaxed text-navy-soft">{body}</p>
          {children}
        </Card>
      </div>
    </div>
  );
}

export default function App() {
  // Wake a sleeping API host early so the gate's server check is fast later.
  useEffect(() => {
    warmUp();
  }, []);

  return (
    <>
      <ErrorBoundary fullScreen label="App">
        <Guarded />
      </ErrorBoundary>
      {/* Global: outside the guard so they persist across every screen. */}
      <UpdateNotification />
      <InstallBanner />
      <ExitPrompt />
    </>
  );
}
