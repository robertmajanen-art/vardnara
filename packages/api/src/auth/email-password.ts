import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { authenticator } from 'otplib'
import type { PrismaClient } from '@prisma/client'
import type { AuthProvider, RegisterResult, TokenPair } from './provider'
import type { JwtPayload } from '../types/index'

type SignFn = (payload: object, opts?: { expiresIn: string }) => string
type VerifyFn = (token: string) => JwtPayload

const SALT_ROUNDS = 10
const REFRESH_BYTES = 32
const REFRESH_DAYS = 30
const ACCESS_EXPIRY = '15m'

export class EmailPasswordProvider implements AuthProvider {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sign: SignFn,
    private readonly verifyJwt: VerifyFn,
  ) {}

  async register(email: string, password: string): Promise<RegisterResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new Error('EMAIL_TAKEN')

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const emailVerifyToken = crypto.randomBytes(32).toString('hex')

    const user = await this.prisma.user.create({
      data: { email, passwordHash, emailVerifyToken },
      select: { id: true, email: true, emailVerifyToken: true },
    })

    return { id: user.id, email: user.email, emailVerifyToken: user.emailVerifyToken! }
  }

  async login(credentials: { email: string; password: string }): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: credentials.email },
      select: { id: true, email: true, passwordHash: true },
    })

    // Constant-time failure: always compare even if user not found
    const hash = user?.passwordHash ?? '$2b$12$invalidhashtopreventtimingattack'
    const valid = await bcrypt.compare(credentials.password, hash)
    if (!user || !valid) throw new Error('INVALID_CREDENTIALS')

    return this.issueTokenPair(user.id, user.email)
  }

  async verify(token: string): Promise<JwtPayload> {
    return this.verifyJwt(token)
  }

  async refreshTokens(rawToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken)

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true } } },
    })

    if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
      throw new Error('INVALID_REFRESH_TOKEN')
    }

    // Rotate: revoke the old token, issue a new pair
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    return this.issueTokenPair(stored.user.id, stored.user.email)
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken)
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailVerifyToken: token },
      select: { id: true },
    })
    if (!user) throw new Error('INVALID_TOKEN')

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    })
  }

  async setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    })

    const secret = authenticator.generateSecret()
    const otpauthUrl = authenticator.keyuri(user.email, 'VårdNära', secret)

    // Store secret but keep totpEnabled=false until verified
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret },
    })

    return { secret, otpauthUrl }
  }

  async enableTotp(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true },
    })
    if (!user.totpSecret) throw new Error('TOTP_NOT_SETUP')

    const valid = authenticator.verify({ token: code, secret: user.totpSecret })
    if (!valid) throw new Error('INVALID_TOTP_CODE')

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    })
  }

  async verifyTotp(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    })
    if (!user.totpEnabled || !user.totpSecret) return true // not enrolled — pass through
    return authenticator.verify({ token: code, secret: user.totpSecret })
  }

  private async issueTokenPair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.sign({ sub: userId, email }, { expiresIn: ACCESS_EXPIRY })

    const raw = crypto.randomBytes(REFRESH_BYTES).toString('hex')
    const tokenHash = hashToken(raw)
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000)

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    })

    return { accessToken, refreshToken: raw }
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
