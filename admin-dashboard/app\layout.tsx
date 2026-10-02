import type { Metadata } from "next";
import "./styles.css";
export const metadata:Metadata={title:"Kotha WiFi Admin",description:"Voucher stock, payments, network usage and Jio cost dashboard"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
