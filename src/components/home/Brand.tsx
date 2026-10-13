import Image from "next/image";
import Link from "next/link";

export default function Brand() {
  return <Link href="/" className="home-brand" aria-label="JobLink home">
    <Image src="/logo-icon.png" alt="" width={80} height={80} />
    <span><strong>JobLink</strong><small>Antigua&apos;s Career Network</small></span>
  </Link>;
}
