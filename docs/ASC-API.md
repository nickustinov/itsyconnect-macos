# App Store Connect API reference

How Itsyconnect fetches and uses ASC API data. Based on real API exploration (see `scripts/explore-app-data.ts`).

Base URL: `https://api.appstoreconnect.apple.com`

## Authentication

JWT signed with ES256 private key. Token fields: `iss` (issuer ID), `aud` ("appstoreconnect-v1"), `kid` (key ID), 20-minute expiry. See `src/lib/asc/client.ts`.

## Endpoints by page

### Apps list

```
GET /v1/apps
  fields[apps] = name,bundleId,sku,primaryLocale
```

Returns: `{ id, attributes: { name, bundleId, sku, primaryLocale } }`

App icons are fetched from each app's latest build via ASC API:
```
GET /v1/builds
  filter[app] = {appId}
  sort = -uploadedDate
  limit = 1
  fields[builds] = iconAssetToken
```
Returns `iconAssetToken.templateUrl` – replace `{w}`, `{h}`, `{f}` placeholders (e.g. `128x128bb.png`). Works for any app with at least one uploaded build, regardless of publication status.

### Overview page

```
GET /v1/apps/{appId}/appStoreVersions
  fields[appStoreVersions] = versionString,appVersionState,appStoreState,platform,copyright,
                              releaseType,earliestReleaseDate,downloadable,createdDate,
                              build,appStoreReviewDetail    ← relationship names required (see quirk #1)
  include = build,appStoreReviewDetail
  fields[builds] = version,uploadedDate,processingState,minOsVersion,iconAssetToken
  fields[appStoreReviewDetails] = contactEmail,contactFirstName,contactLastName,contactPhone,
                                   demoAccountName,demoAccountPassword,demoAccountRequired,notes
```

Version attributes:
| Field | Example |
|---|---|
| `platform` | `MAC_OS`, `IOS` |
| `versionString` | `"2.1.0"` |
| `appStoreState` | `WAITING_FOR_REVIEW`, `READY_FOR_SALE`, `PREPARE_FOR_SUBMISSION`, `REJECTED` |
| `appVersionState` | `WAITING_FOR_REVIEW`, `READY_FOR_DISTRIBUTION` |
| `releaseType` | `MANUAL`, `AFTER_APPROVAL` |
| `createdDate` | ISO 8601 |

### Store listing (localizations)

```
GET /v1/appStoreVersions/{versionId}/appStoreVersionLocalizations
  fields[appStoreVersionLocalizations] = locale,description,keywords,marketingUrl,
                                          promotionalText,supportUrl,whatsNew
```

Localization attributes:
| Field | Notes |
|---|---|
| `locale` | `en-US`, `es-ES`, `fr-FR`, etc. |
| `description` | Full App Store description |
| `whatsNew` | Release notes |
| `keywords` | Comma-separated string |
| `marketingUrl` | URL or null |
| `promotionalText` | Editable anytime, null if not set |
| `supportUrl` | URL |

### Screenshots

```
GET /v1/appStoreVersionLocalizations/{localizationId}/appScreenshotSets
  include = appScreenshots
  fields[appScreenshotSets] = screenshotDisplayType
  fields[appScreenshots] = fileSize,fileName,sourceFileChecksum,assetDeliveryState,assetToken
```

Screenshot set attributes:
- `screenshotDisplayType` – `APP_DESKTOP`, `APP_IPHONE_67`, `APP_IPAD_PRO_3GEN_129`, etc.

Screenshot attributes:
- `fileName`, `fileSize`, `sourceFileChecksum` (MD5)
- `assetToken` – path-like token (e.g. `PurpleSource211/v4/.../1.png`)
- `assetDeliveryState.state` – `COMPLETE`, `UPLOAD_COMPLETE`, `FAILED`

### App previews

```
GET /v1/appStoreVersionLocalizations/{localizationId}/appPreviewSets
  include = appPreviews
  fields[appPreviewSets] = previewType
  fields[appPreviews] = fileSize,fileName,previewFrameTimeCode,mimeType,videoUrl,
                         assetDeliveryState,sourceFileChecksum,previewImage
```

### App details

```
GET /v1/apps/{appId}/appInfos
  include = primaryCategory,secondaryCategory,ageRatingDeclaration
  fields[appInfos] = appStoreState,appStoreAgeRating,brazilAgeRating,brazilAgeRatingV2,kidsAgeBand,state
  fields[appCategories] = platforms,parent
```

App info attributes:
- `appStoreAgeRating` – `FOUR_PLUS`, `NINE_PLUS`, `TWELVE_PLUS`, `SEVENTEEN_PLUS`
- Includes `ageRatingDeclarations` with boolean/enum fields for content descriptors

```
GET /v1/appInfos/{appInfoId}/appInfoLocalizations
  fields[appInfoLocalizations] = locale,name,subtitle,privacyPolicyText,privacyPolicyUrl,privacyChoicesUrl
```

### App review

```
GET /v1/appStoreVersions/{versionId}/appStoreReviewDetail
```

Returns: `contactFirstName`, `contactLastName`, `contactPhone`, `contactEmail`, `demoAccountName`, `demoAccountPassword`, `demoAccountRequired`, `notes`

Has a `relationships.appStoreReviewAttachments` link for file attachments.

### Builds (TestFlight)

```
GET /v1/builds
  filter[app] = {appId}
  sort = -uploadedDate
  fields[builds] = version,uploadedDate,processingState,minOsVersion,usesNonExemptEncryption,
                    expirationDate,expired,iconAssetToken,buildAudienceType,computedMinMacOsVersion
  include = preReleaseVersion,buildBetaDetail,betaBuildLocalizations,icons
  fields[preReleaseVersions] = version,platform
  fields[buildBetaDetails] = autoNotifyEnabled,internalBuildState,externalBuildState
  fields[betaBuildLocalizations] = locale,whatsNew
  fields[buildIcons] = iconAsset,iconType
```

Build attributes:
| Field | Example |
|---|---|
| `version` | `"238"` (build number, string) |
| `uploadedDate` | ISO 8601 |
| `expirationDate` | ISO 8601 (90 days after upload) |
| `expired` | boolean |
| `processingState` | `VALID`, `PROCESSING`, `FAILED`, `INVALID` |
| `buildAudienceType` | `APP_STORE_ELIGIBLE` |
| `minOsVersion` | `"14.0"` |
| `iconAssetToken.templateUrl` | Template with `{w}x{h}bb.{f}` placeholders |

Included per build:
- **`preReleaseVersions`** – `{ version: "2.1.0", platform: "MAC_OS" }` – maps build to app version
- **`buildBetaDetails`** – `{ autoNotifyEnabled, internalBuildState, externalBuildState }`
  - States: `PROCESSING`, `READY_FOR_BETA_TESTING`, `IN_BETA_TESTING`, `READY_FOR_BETA_SUBMISSION`, `IN_BETA_REVIEW`, `EXPIRED`, `MISSING_EXPORT_COMPLIANCE`
- **`betaBuildLocalizations`** – `{ whatsNew, locale }` – TestFlight "what to test" notes
- **`buildIcons`** – two per build (APP_STORE icon type), each with `iconAsset.templateUrl`

Per-build relationships:
```
GET /v1/builds/{buildId}/individualTesters
  fields[betaTesters] = firstName,lastName,email,state
```

**Note:** `GET /v1/builds/{buildId}/betaGroups` returns empty – groups must be queried via `/v1/betaGroups` and cross-referenced.

### Beta groups (TestFlight)

```
GET /v1/betaGroups
  filter[app] = {appId}
  fields[betaGroups] = name,isInternalGroup,publicLinkEnabled,publicLinkId,publicLink,
                        publicLinkLimit,publicLinkLimitEnabled,feedbackEnabled,
                        hasAccessToAllBuilds,iosBuildsAvailableForAppleSiliconMac,createdDate
```

Beta group attributes:
| Field | Notes |
|---|---|
| `name` | `"Internal"`, `"External"`, etc. |
| `isInternalGroup` | boolean |
| `publicLink` | Full TestFlight URL or null |
| `publicLinkEnabled` | boolean or null (internal groups) |
| `hasAccessToAllBuilds` | true for internal, null for external |
| `feedbackEnabled` | boolean |
| `createdDate` | ISO 8601 |

Testers per group:
```
GET /v1/betaGroups/{groupId}/betaTesters
  fields[betaTesters] = firstName,lastName,email,inviteType,state
```

Tester attributes:
- `firstName` – `"Anonymous"` for public link testers
- `email` – null for public link testers
- `inviteType` – `PUBLIC_LINK` or `EMAIL`
- `state` – `INSTALLED`, `ACCEPTED`, `NOT_INVITED`, `REVOKED`

### Beta app info (TestFlight)

```
GET /v1/betaAppLocalizations
  filter[app] = {appId}
  fields[betaAppLocalizations] = description,feedbackEmail,locale,marketingUrl,
                                  privacyPolicyUrl,tvOsPrivacyPolicy
```

```
GET /v1/betaAppReviewDetails
  filter[app] = {appId}
  fields[betaAppReviewDetails] = contactEmail,contactFirstName,contactLastName,contactPhone,
                                  demoAccountName,demoAccountPassword,demoAccountRequired,notes
```

### TestFlight feedback (screenshot and crash submissions)

Two parallel endpoints for tester feedback – one for screenshot submissions, one for crash submissions. Both are JWT-authenticated and were introduced in ASC API v4.0.

```
GET /v1/apps/{appId}/betaFeedbackScreenshotSubmissions
  include = build,tester
  sort = -createdDate
  limit = 200
  fields[betaTesters] = firstName,lastName,email
  fields[builds] = version

GET /v1/apps/{appId}/betaFeedbackCrashSubmissions
  include = build,tester
  sort = -createdDate
  limit = 200
  fields[betaTesters] = firstName,lastName,email
  fields[builds] = version
```

Shared attributes: `comment`, `email`, `createdDate`, `appPlatform`, `devicePlatform`, `deviceFamily`, `deviceModel`, `osVersion`, `locale`, `buildBundleId`, `architecture`, `connectionType` (WIFI/MOBILE_DATA/WIRE/UNKNOWN/NONE), `batteryPercentage`, `timeZone`, `pairedAppleWatch`, `appUptimeInMilliseconds`, `diskBytesAvailable`, `diskBytesTotal`, `screenWidthInPoints`, `screenHeightInPoints`

Screenshot-specific: `screenshots` array – each with `url`, `width`, `height`, `expirationDate`

Crash-specific: `crashLog` relationship linking to a `BetaCrashLog` resource:
```
GET /v1/betaFeedbackCrashSubmissions/{id}/crashLog
```
Returns `{ data: { attributes: { logText } } }`

Supported filters: `appPlatform`, `build`, `build.preReleaseVersion`, `deviceModel`, `devicePlatform`, `osVersion`, `tester`

Delete endpoints:
```
DELETE /v1/betaFeedbackScreenshotSubmissions/{id}
DELETE /v1/betaFeedbackCrashSubmissions/{id}
```

**Implementation pattern:** fetch both endpoints in parallel, merge results, sort by `createdDate` descending. Cache with `tf-feedback:{appId}` key.

### Customer reviews

```
GET /v1/apps/{appId}/customerReviews
  sort = -createdDate
  fields[customerReviews] = rating,title,body,reviewerNickname,createdDate,territory
  include = response
  fields[customerReviewResponses] = responseBody,lastModifiedDate,state
```

Review attributes:
| Field | Example |
|---|---|
| `rating` | 1–5 |
| `title` | String |
| `body` | String |
| `reviewerNickname` | String |
| `createdDate` | ISO 8601 |
| `territory` | `"USA"`, `"NLD"`, `"FRA"` (ISO 3166-1 alpha-3) |

#### Customer review responses

`customerReviewResponses` only supports CREATE, DELETE, and GET – **no PATCH/UPDATE**. To edit a reply: delete the old response, then create a new one.

### In-app purchases

```
GET /v1/apps/{appId}/inAppPurchasesV2
  fields[inAppPurchases] = name,productId,inAppPurchaseType,state,reviewNote,
                            familySharable,contentHosting
```

IAP attributes:
- `inAppPurchaseType` – `NON_CONSUMABLE`, `CONSUMABLE`, `NON_RENEWING_SUBSCRIPTION`
- `state` – `APPROVED`, `WAITING_FOR_REVIEW`, `DEVELOPER_ACTION_NEEDED`, etc.

### Subscription groups

```
GET /v1/apps/{appId}/subscriptionGroups
  include = subscriptions
  fields[subscriptionGroups] = referenceName
  fields[subscriptions] = name,productId,familySharable,state,subscriptionPeriod,reviewNote,groupLevel
```

## Icon template URLs

Build and app icons use template URLs with placeholders:
```
https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/.../AppIcon.icns/{w}x{h}bb.{f}
```

Replace `{w}` and `{h}` with pixel dimensions, `{f}` with format (`png`, `jpg`, `webp`). Example:
```
.../AppIcon.icns/64x64bb.png
```

### Build metrics (betaBuildUsages)

```
GET /v1/builds/{buildId}/metrics/betaBuildUsages
```

Returns: `{ data: [{ dataPoints: [{ values: { ... } }] }] }`

Values fields:
| Field | Type | Notes |
|---|---|---|
| `installCount` | number | Total installs |
| `sessionCount` | number | Total sessions |
| `crashCount` | number | Total crashes |
| `inviteCount` | number | Total invites sent |
| `feedbackCount` | number | Total feedback submissions |

### Build diagnostic signatures

```
GET /v1/builds/{buildId}/diagnosticSignatures
  filter[diagnosticType] = DISK_WRITES | HANGS | LAUNCHES
  limit = 200
```

Returns: `{ data: [{ id, attributes: { diagnosticType, signature, weight } }] }`

Signature attributes:
| Field | Type | Notes |
|---|---|---|
| `diagnosticType` | string | `DISK_WRITES`, `HANGS`, or `LAUNCHES` |
| `signature` | string | Human-readable signature (e.g. function name) |
| `weight` | number | 0–1 fraction indicating relative frequency |

### Diagnostic logs

```
GET /v1/diagnosticSignatures/{signatureId}/logs
```

Returns: `{ data: [{ attributes: { diagnosticMetaData, callStackTree, insights } }] }`

- `diagnosticMetaData` – key-value pairs (deviceType, osVersion, etc.)
- `callStackTree` – array of `{ callStacks: [{ callStackRootFrames: [frame, ...] }] }`
- Each frame: `{ symbolName, binaryName, fileName?, lineNumber?, address?, isBlameFrame, sampleCount, subFrames? }`
- `insights` – array of `{ category, description, url? }` with Apple's analysis

**Note:** Diagnostic data is available for all builds including expired ones. Signatures are cached for 15 minutes. Logs are fetched on-demand (no caching).

## Known API quirks

1. **`fields[type]` strips relationships** – the ASC API follows JSON:API sparse fieldsets: when you specify `fields[someType]=attr1,attr2`, the response omits **all** relationship pointers not listed. To keep relationship data needed by `include`, you must add the relationship names to `fields`. For example: `fields[appStoreVersions]=versionString,...,build,appStoreReviewDetail` – without `build,appStoreReviewDetail` in the list, the `relationships` key is missing from each version object and `resolveIncluded()` cannot match included items to their parents.
2. **`sort` not allowed on `/appStoreVersions`** – versions come in creation order, newest first
3. **`betaGroups` relationship on builds is write-only** – `GET /v1/builds/{id}/betaGroups` returns empty; query groups via `/v1/betaGroups` instead
4. **Age rating fields** – don't specify `fields[ageRatingDeclarations]`; let the API return defaults. Some documented fields like `gamblingAndContests`, `seventeenPlus` are rejected
5. **`appStoreVersionSubmissions`** – has no queryable fields; include it only for relationship presence detection
6. **Public link testers** – `firstName` is `"Anonymous"`, `email` is null, `inviteType` is `"PUBLIC_LINK"`
7. **Build expiry** – 90 days from upload. `expired: true` + `expirationDate` in the past means the build is no longer installable
8. **`POST /v1/betaTesters` rejects `apps` relationship** – the `apps` relationship is read-only; CREATE only accepts `builds` or `betaGroups` relationships
9. **Screenshot set `relationships` omitted** – when querying `/appScreenshotSets?include=appScreenshots`, the API returns screenshots in `included` but omits the `relationships` key on each set, making it impossible to map screenshots to their parent set. Workaround: fetch screenshots per set via `/v1/appScreenshotSets/{id}/appScreenshots`
