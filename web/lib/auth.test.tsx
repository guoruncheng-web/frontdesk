import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function Harness() {
  const { startDemo, signOut, status } = useAuth();

  return (
    <>
      <span data-testid="status">{status}</span>
      <button onClick={() => void startDemo()}>start demo</button>
      <button onClick={signOut}>sign out</button>
    </>
  );
}

/**
 * Seeds a client with a workspace's cached data, the way a signed-in console
 * leaves it behind.
 */
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["tickets"], [{ id: "ticket-from-the-previous-workspace" }]);
  client.setQueryData(["usage"], { calls: 12 });

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return client;
}

describe("AuthProvider", () => {
  it("forgets the cached workspace on sign-out", async () => {
    const client = mount();
    await screen.findByText("anonymous");

    await userEvent.click(screen.getByRole("button", { name: "sign out" }));

    expect(client.getQueryData(["tickets"])).toBeUndefined();
    expect(client.getQueryData(["usage"])).toBeUndefined();
  });

  it("forgets it again when a new session signs in, so a fresh sandbox never renders the last one", async () => {
    const client = mount();
    await screen.findByText("anonymous");

    // A cache left over from a previous sign-in, as it would be after signing
    // out and straight back in within the same tab.
    client.setQueryData(["ticket", "ticket-from-the-previous-workspace"], {
      draft: { body: "the previous visitor’s approved reply", approved: true },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          accessToken: "token-for-the-new-sandbox",
          user: { id: "u2", name: "Someone Else", email: "b@example.com", organizationId: "org-2", organizationName: "Org Two" },
        }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "start demo" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    expect(client.getQueryData(["ticket", "ticket-from-the-previous-workspace"])).toBeUndefined();
    expect(client.getQueryData(["tickets"])).toBeUndefined();
  });
});
