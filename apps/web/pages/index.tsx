import { BrowserRouter, MemoryRouter } from "react-router";
import { App } from "../src/shell/App";

export default function TenderRoomPage({
  initialPath,
}: {
  initialPath: string;
}) {
  if (typeof window === "undefined") {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    );
  }
  return <BrowserRouter><App /></BrowserRouter>;
}

export function getServerSideProps({
  resolvedUrl,
}: {
  resolvedUrl: string;
}) {
  return { props: { initialPath: resolvedUrl } };
}
