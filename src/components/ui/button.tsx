import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/* 我的世界石头方块按钮：顶部高光、底部暗面、硬像素投影、按下位移 */
const BTN_SHADOW =
  'shadow-[inset_0_3px_0_rgba(255,255,255,0.22),inset_0_-4px_0_rgba(0,0,0,0.28),3px_3px_0_0_var(--mc-outline)]'

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-2 text-sm font-bold transition-[filter,transform] pixel-press',
    'active:translate-x-[3px] active:translate-y-[3px]',
    'active:shadow-[inset_0_3px_0_rgba(255,255,255,0.22),inset_0_-2px_0_rgba(0,0,0,0.28)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary text-primary-foreground border-[var(--mc-outline)]',
          BTN_SHADOW,
          'hover:brightness-105',
        ),
        destructive: cn(
          'bg-destructive text-destructive-foreground border-[var(--mc-outline)]',
          BTN_SHADOW,
          'hover:brightness-105',
        ),
        outline: cn(
          'bg-[var(--mc-plank)] text-[#2a1c0d] border-[var(--mc-outline)]',
          'shadow-[inset_0_3px_0_var(--mc-plank-light),inset_0_-4px_0_var(--mc-plank-dark),3px_3px_0_0_var(--mc-outline)]',
          'hover:brightness-105',
        ),
        secondary: cn(
          'bg-secondary text-secondary-foreground border-[var(--mc-outline)]',
          BTN_SHADOW,
          'hover:brightness-105',
        ),
        ghost: 'border-transparent hover:bg-accent hover:text-accent-foreground',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
