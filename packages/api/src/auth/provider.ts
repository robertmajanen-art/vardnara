import type { JwtPayload } from '../types/index'

export interface RegisterResult {
  id: string
  email: string
  emailVerifyToken: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

// AuthProvider interface — swap EmailPasswordProvider for BankIDProvider in Week 4
// without touching any route handlers.
export interface AuthProvider {
  register(email: string, password: string): Promise<RegisterResult>
  login(credentials: { email: string; password: string }): Promise<TokenPair>
  verify(token: string): Promise<JwtPayload>
  refreshTokens(rawRefreshToken: string): Promise<TokenPair>
  logout(rawRefreshToken: string): Promise<void>
  verifyEmail(token: string): Promise<void>
  setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string }>
  enableTotp(userId: string, code: string): Promise<void>
  verifyTotp(userId: string, code: string): Promise<boolean>
}
