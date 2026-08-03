function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause ?? "");
}

export function transactionErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  const message = messageFrom(cause);
  if (message.includes("BidDeadlinePassed")) {
    return "This tender's bid deadline has passed. Choose another active tender.";
  }
  if (
    message.includes("UserRejectedRequestError") ||
    message.includes("User denied") ||
    message.includes("user rejected") ||
    message.includes("Request rejected")
  ) {
    return "The wallet request was rejected.";
  }
  if (message.toLowerCase().includes("insufficient funds")) {
    return "This wallet does not have enough Sepolia ETH for gas.";
  }
  if (
    message.includes("HTTP request failed") ||
    message.includes("Failed to fetch") ||
    message.includes("RpcRequestError")
  ) {
    return "Sepolia RPC is temporarily unavailable. Please try again.";
  }
  if (
    message.includes("Contract Call:") ||
    message.includes("Request body:") ||
    message.includes("Request Arguments:") ||
    message.includes("execution reverted") ||
    /0x[0-9a-fA-F]{64,}/.test(message) ||
    message.length > 360
  ) {
    return fallback;
  }
  return message.trim() || fallback;
}
