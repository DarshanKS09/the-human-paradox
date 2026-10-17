import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FreeSuccessDetails from "./FreeSuccessDetails";

export const metadata: Metadata = {
  title: "Your ebook is ready",
  description: "Download your free copy of Your Mind Is Not Your Enemy.",
};

export default function FreeSuccessPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="pt-16 sm:pt-[4.5rem]">
        <div className="shell-narrow section-pad">
          <Suspense
            fallback={
              <p role="status" className="text-muted">
                Preparing your download…
              </p>
            }
          >
            <FreeSuccessDetails />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}