import './globals.css';

export const metadata = {
  title: 'Crypto Discovery Agent',
  description: 'Surface promising newly listed tokens using CoinMarketCap data and AI scoring.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
