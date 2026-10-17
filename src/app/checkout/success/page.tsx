import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SuccessDetails from "./SuccessDetails";

export const metadata: Metadata = {
  title: "Purchase confirmation",
  description: "Confirm your ebook purchase and download your copy.",
};

export default function SuccessPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="pt-16 sm:pt-[4.5rem]">
        <div className="shell-narrow section-pad">
          <Suspense
            fallback={
              <p role="status" className="text-muted">
                Loading your purchase status…
              </p>
            }
          >
            <SuccessDetails />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
