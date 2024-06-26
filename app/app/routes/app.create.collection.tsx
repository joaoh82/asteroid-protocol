import type { CollectionMetadata, TxInscription } from '@asteroid-protocol/sdk'
import { CheckIcon } from '@heroicons/react/20/solid'
import { GlobeAltIcon } from '@heroicons/react/24/outline'
import { Link } from '@remix-run/react'
import clsx from 'clsx'
import { useState } from 'react'
import {
  Button,
  Link as DaisyLink,
  FileInput,
  Form,
  Input,
  Textarea,
} from 'react-daisyui'
import { useForm } from 'react-hook-form'
import InfoTooltip from '~/components/InfoTooltip'
import TxDialog from '~/components/dialogs/TxDialog'
import CosmosAddressInput from '~/components/form/CosmosAddressInput'
import Label from '~/components/form/Label'
import NumericInput from '~/components/form/NumericInput'
import Discord from '~/components/icons/discord'
import Telegram from '~/components/icons/telegram'
import Twitter from '~/components/icons/twitter'
import { Wallet } from '~/components/wallet/Wallet'
import { useRootContext } from '~/context/root'
import { useDialogWithValue } from '~/hooks/useDialog'
import { useInscriptionOperations } from '~/hooks/useOperations'
import { loadImage } from '~/utils/file'
import 'react-datepicker/dist/react-datepicker.css'

type FormData = {
  name: string
  ticker: string
  description: string
  content: File[]
  website: string
  twitter: string
  telegram: string
  discord: string
  royaltyPercentage: number
  paymentAddress: string
}

const NAME_MIN_LENGTH = 1
const NAME_MAX_LENGTH = 32
const TICKER_MIN_LENGTH = 1
const TICKER_MAX_LENGTH = 10

export default function CreateCollection() {
  const { maxFileSize } = useRootContext()
  const operations = useInscriptionOperations()

  // form
  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>()
  const name = watch('name')
  const ticker = watch('ticker')
  const paymentAddress = watch('paymentAddress')
  const [createdTicker, setCreatedTicker] = useState<string | null>(null)

  // preview
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  // dialog
  const { dialogRef, value, showDialog } = useDialogWithValue<TxInscription>()

  const onSubmit = handleSubmit(async (data) => {
    if (!operations) {
      console.warn('No address')
      return
    }

    const file = data.content[0]
    const mime = file?.type ?? ''
    const fileBuffer = await file.arrayBuffer()
    const byteArray = new Uint8Array(fileBuffer)
    if (!byteArray.byteLength) {
      console.warn('No file data')
      return
    }

    const metadata: CollectionMetadata = {
      name: data.name,
      mime: mime,
      symbol: data.ticker.toUpperCase(),
      description: data.description,
    }
    if (data.website) {
      metadata.website = data.website
    }
    if (data.twitter) {
      metadata.twitter = data.twitter
    }
    if (data.telegram) {
      metadata.telegram = data.telegram
    }
    if (data.discord) {
      metadata.discord = data.discord
    }
    if (data.royaltyPercentage) {
      metadata.royalty_percentage = data.royaltyPercentage / 100
    }

    if (data.paymentAddress) {
      metadata.payment_address = data.paymentAddress
    }

    const txInscription = operations.inscribeCollection(byteArray, metadata)

    showDialog(txInscription)
  })

  return (
    <div>
      <Form onSubmit={onSubmit} className="flex flex-row mt-4">
        <div className="flex flex-1 flex-col items-center">
          {preview && (
            <img
              src={preview}
              alt="Inscription preview"
              className="max-w-48 mb-4"
            />
          )}

          <div
            className={clsx('flex flex-col', {
              ['bg-base-200 border border-neutral border-dashed rounded-3xl p-8']:
                fileName == null,
            })}
          >
            {fileName ? (
              <span className="text-center">{fileName}</span>
            ) : (
              <>
                <span className="flex items-center justify-center text-lg">
                  Collection Logo
                  <InfoTooltip
                    message="Can be a custom image or one of your favorite inscriptions from your collection"
                    className="ml-2"
                  />
                </span>
                <span className="mt-4">Minimum dimensions</span>
                <span>250x250</span>
                <span className="mt-4">Maximum dimensions</span>
                <span>1024x1024</span>
                <span className="mt-4">Max file size</span>
                <span>550kb</span>
              </>
            )}

            <label htmlFor="content" className="btn btn-accent mt-4">
              {fileName ? 'Change file' : 'Select file'}
            </label>
            <FileInput
              key="content"
              id="content"
              className="opacity-0"
              {...register('content', {
                required: true,
                validate: async (files) => {
                  const file = files[0]
                  if (!file) {
                    return
                  }

                  if (!file.type.startsWith('image/')) {
                    return 'Only image files are allowed for collection logos'
                  }
                  if (file.size > maxFileSize) {
                    return `File size exceeds maximum allowed size of ${maxFileSize / 1000} kb`
                  }

                  const img = await loadImage(URL.createObjectURL(file))
                  if (!img) {
                    return 'Invalid image'
                  }

                  const height = img.naturalHeight
                  const width = img.naturalWidth

                  if (width != height) {
                    return 'Image must be square'
                  }

                  if (width < 250 || width > 1024) {
                    return 'Image must be square and between 250x250 and 1024x1024 pixels'
                  }
                },
              })}
              color={errors.content ? 'error' : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0]
                setFileName(file?.name ?? null)

                if (file && file.type.startsWith('image/')) {
                  setPreview(URL.createObjectURL(file))
                } else {
                  setPreview(null)
                }
              }}
            />
            {errors.content && (
              <span className="text-error">
                {errors.content.message
                  ? errors.content.message
                  : 'Collection logo is required'}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col ml-8">
          <strong>Create a collection</strong>
          <p className="mt-2">
            Creating a collection is a two-step process. First, create a
            collection inscription using the form below. Then, you can add
            inscriptions to your collection on the{' '}
            <Link
              className="link link-hover"
              to="/app/create/inscription"
              target="_blank"
            >
              Create Inscription
            </Link>{' '}
            page. All information below will appear on your collection&apos;s
            landing page on{` `}
            <DaisyLink href="https://asteroidprotocol.io">
              asteroidprotocol.io
            </DaisyLink>
            . Note that collection inscriptions are non-transferrable.
          </p>

          <div className="form-control w-full mt-4">
            <Label
              title="Name"
              htmlFor="name"
              tooltip="Your collection must have a unique name"
            />
            <Input
              id="name"
              placeholder="Name your collection"
              color={errors.name ? 'error' : undefined}
              {...register('name', {
                required: true,
                minLength: NAME_MIN_LENGTH,
                maxLength: NAME_MAX_LENGTH,
                pattern: /^[a-zA-Z0-9-. ]+$/,
              })}
              maxLength={NAME_MAX_LENGTH}
              minLength={NAME_MIN_LENGTH}
            />
            <label className="label" htmlFor="name">
              <span
                className={clsx('label-text-alt', {
                  ['text-error']: errors.name != null,
                })}
              >
                {errors.name
                  ? 'Name is required and must be 1-32 characters long'
                  : '1 - 32 characters, alphanumeric only'}
              </span>
              <span className="label-text-alt">{name?.length ?? 0} / 32</span>
            </label>
          </div>

          <div className="form-control w-full mt-4">
            <Form.Label
              title="Ticker"
              htmlFor="ticker"
              className="justify-start"
            >
              <InfoTooltip
                className="ml-2"
                message="Your collection must have a unique ticker, which will be used in your collection's URL"
              />
            </Form.Label>
            <Input
              placeholder="NFT"
              id="ticker"
              className="uppercase"
              color={errors.ticker ? 'error' : undefined}
              {...register('ticker', {
                required: true,
                minLength: TICKER_MIN_LENGTH,
                maxLength: TICKER_MAX_LENGTH,
                pattern: /^[a-zA-Z0-9-.]+$/,
              })}
              minLength={TICKER_MIN_LENGTH}
              maxLength={TICKER_MAX_LENGTH}
            />
            <label className="label" htmlFor="ticker">
              <span
                className={clsx('label-text-alt', {
                  ['text-error']: errors.ticker != null,
                })}
              >
                {errors.ticker
                  ? 'Ticker is required and must be 1 - 10 characters, alphanumeric only'
                  : '1 - 10 characters, alphanumeric only'}
              </span>
              <span className="label-text-alt">{ticker?.length ?? 0} / 10</span>
            </label>
          </div>

          <NumericInput
            control={control}
            error={errors.royaltyPercentage}
            isFloat
            suffix="%"
            decimalScale={2}
            allowNegative={false}
            isAllowed={(values) => {
              const { floatValue } = values
              if (floatValue === undefined) {
                return true
              }
              return floatValue! <= 100
            }}
            name="royaltyPercentage"
            title="Royalty %"
            tooltip="Can range from 0% to x%. New artists typically choose 5% or less while established artists can command royalties of 5%-15%"
            className="mt-4"
          />

          <CosmosAddressInput
            register={register}
            name="paymentAddress"
            error={errors.paymentAddress}
            title="Royalty payment address (optional)"
            tooltip="The address where royalties will be sent. Must be a Cosmos Hub address. If left blank, royalties will be sent to the collection owner's address."
            value={paymentAddress ?? ''}
          />

          <div className="form-control w-full mt-4">
            <Label
              title="Website"
              htmlFor="website"
              tooltip="A website or URL dedicated to your collection"
              icon={<GlobeAltIcon className="size-5" />}
            />
            <Input
              id="website"
              color={errors.website ? 'error' : undefined}
              placeholder="Website URL"
              {...register('website', { pattern: /^https?:\/\/.+/ })}
            />
            {errors.website && (
              <label className="label" htmlFor="website">
                <span className="label-text-alt text-error">
                  Website URL is invalid
                </span>
              </label>
            )}
          </div>

          <div className="form-control w-full mt-4">
            <Label
              title="Twitter"
              htmlFor="twitter"
              icon={<Twitter className="size-4" />}
            />
            <Input
              id="twitter"
              color={errors.twitter ? 'error' : undefined}
              placeholder="https://twitter.com/handle"
              {...register('twitter', {
                pattern: /^https:\/\/twitter.com\/.+/,
              })}
            />
            {errors.twitter && (
              <label className="label" htmlFor="twitter">
                <span className="label-text-alt text-error">
                  Twitter URL is invalid
                </span>
              </label>
            )}
          </div>

          <div className="form-control w-full mt-4">
            <Label
              title="Telegram"
              htmlFor="telegram"
              icon={<Telegram className="size-4" />}
            />
            <Input
              id="telegram"
              color={errors.telegram ? 'error' : undefined}
              placeholder="https://t.me/channel_name"
              {...register('telegram', { pattern: /^https:\/\/t.me\/.+/ })}
            />
            {errors.telegram && (
              <label className="label" htmlFor="telegram">
                <span className="label-text-alt text-error">
                  Telegram URL is invalid
                </span>
              </label>
            )}
          </div>

          <div className="form-control w-full mt-4">
            <Label
              title="Discord"
              htmlFor="discord"
              icon={<Discord className="size-5" />}
            />
            <Input
              id="discord"
              color={errors.discord ? 'error' : undefined}
              placeholder="https://discord.com/invite/channel_name"
              {...register('discord', {
                pattern: /^https:\/\/discord.com\/.+/,
              })}
            />
            {errors.discord && (
              <label className="label" htmlFor="discord">
                <span className="label-text-alt text-error">
                  Discord URL is invalid
                </span>
              </label>
            )}
          </div>

          <div className="form-control w-full mt-4">
            <Label
              title="Description"
              htmlFor="description"
              tooltip="Will appear at the top of your collection's landing page, and can also be used by third-party apps"
            />
            <Textarea
              id="description"
              placeholder="Describe your collection"
              rows={10}
              {...register('description')}
            />
          </div>

          {operations ? (
            <Button
              type="submit"
              color="primary"
              className="mt-4"
              startIcon={<CheckIcon className="size-5" />}
            >
              Create collection
            </Button>
          ) : (
            <Wallet className="mt-4 btn-md w-full" color="primary" />
          )}
        </div>
      </Form>
      <TxDialog
        ref={dialogRef}
        txInscription={value}
        resultLink={`/app/collection/${createdTicker?.toUpperCase()}`}
        resultCTA="View Collection"
        onSuccess={() => {
          setCreatedTicker(ticker)
          reset()
          setFileName(null)
        }}
      />
    </div>
  )
}
