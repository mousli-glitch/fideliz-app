export type GameConfigV1 = {
  meta: {
    gameId: string
    restaurantId: string
    slug: string
    version: "v1"
    createdAt: string
    updatedAt: string
    status: "draft" | "active" | "paused"
  }

  branding: {
    logoUrl?: string
    backgroundUrl?: string
    primaryColor: string
    secondaryColor: string
    textColor: string
    fontFamily: string
  }

  content: {
    restaurantName: string
    title: string
    subtitle?: string
    description?: string
    googleReviewUrl?: string
    ctaScanLabel: string
    ctaReviewLabel: string
    ctaPlayLabel: string
    winMessageTitle: string
    winMessageSubtitle?: string
    legalNoticeShort?: string
  }

  wheel: {
    enabled: boolean
    mode: "2d"
    segments: {
      id: string
      label: string
      prizeId: string
      probability: number
      color?: string
    }[]
  }

  prizes: {
    id: string
    title: string
    description?: string
    imageUrl?: string
    quantity?: number | null
    isActive: boolean
  }[]

  participantForm: {
    collectFirstName: boolean
    collectLastName: boolean
    collectEmail: boolean
    collectPhone: boolean
    requireAtLeastOneContact: boolean
    consentText: string
  }

  validation: {
    redeemMethod: "admin_dashboard"
    showTicket: boolean
    ticketText: string
    ticketDisclaimer?: string
  }

  printA6: {
    enabled: boolean
    widthPx: number
    heightPx: number
    showQrCode: boolean
    showPrize: boolean
    footerText?: string
  }

  legal: {
    rulesUrl?: string
    privacyUrl?: string
    termsTextPlaceholder?: string
  }
}