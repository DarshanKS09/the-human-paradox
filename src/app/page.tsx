import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Philosophy from "@/components/Philosophy";
import EbookSection from "@/components/EbookSection";
import About from "@/components/About";
import Closing from "@/components/Closing";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Philosophy />
        <EbookSection />
        <About />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
