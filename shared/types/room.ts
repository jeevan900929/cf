export type RoomActionType = "increment" | "decrement" | "reset";

export interface RoomState {
  count: number;
  connectedClients: number;
}

export interface RoomEvent {
  id: number;
  type: string;
  actor: string;
  stateBefore: number;
  stateAfter: number;
  timestamp: string;
}

export interface RoomActionResponse {
  ok: true;
  roomId: string;
  count: number;
  action: string;
}

export interface RoomWsMessage {
  type: "state" | "action" | "join" | "leave";
  count: number;
  connectedClients: number;
  action?: string;
  actor?: string;
}
