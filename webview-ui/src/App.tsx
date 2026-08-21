import { ReactFlowProvider } from '@xyflow/react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/UI/tooltip';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Toolbar } from '@/components/Toolbar/Toolbar';
import { Canvas } from '@/components/Canvas/Canvas';
import { PropertiesPanel } from '@/components/Properties/PropertiesPanel';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useVscodeBridge } from '@/hooks/use-vscode-bridge';

function App() {
  const theme = useTheme();
  useKeyboardShortcuts();
  useVscodeBridge();

  return (
    <TooltipProvider delayDuration={300}>
      <ReactFlowProvider>
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Toolbar />
              <main className="flex-1 overflow-hidden relative">
                <Canvas />
                <PropertiesPanel />
              </main>
            </div>
          </div>
        </div>
        <Toaster
          theme={theme}
          position="bottom-center"
          toastOptions={{
            className: 'font-mono text-xs',
          }}
        />
      </ReactFlowProvider>
    </TooltipProvider>
  );
}

export default App;
