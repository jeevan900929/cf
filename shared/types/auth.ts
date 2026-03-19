export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  ok: true;
  token: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}
