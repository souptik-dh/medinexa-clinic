import { Outfit } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { AiChatProvider } from '@/context/AiChatContext';
import AiAssistant from '@/components/ai/AiAssistant';
import AppToaster from '@/components/common/AppToaster';
import AppSWRConfig from '@/components/common/AppSWRConfig';

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <AppToaster />
          <AuthProvider>
            <AiChatProvider>
              <AppSWRConfig>
                <SidebarProvider>{children}</SidebarProvider>
              </AppSWRConfig>
              <AiAssistant />
            </AiChatProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
