import { DeepPartial } from "@/types/utils"

/**
 * 深度合并两个对象
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export function deepMerge<T>(target: T, source?: DeepPartial<T>): T {
    if (!isPlainObject(target) || !isPlainObject(source)) {
        return source !== undefined ? (source as T) : target
    }

    const result: Record<string, unknown> = { ...target }
    const sourceRecord = source as Record<string, unknown>
    const targetRecord = target as Record<string, unknown>

    Object.keys(sourceRecord).forEach((key) => {
        const sourceValue = sourceRecord[key]
        const targetValue = targetRecord[key]

        // 数组：直接覆盖（非常重要）
        if (Array.isArray(sourceValue)) {
            result[key] = sourceValue
            return
        }

        // 普通对象：递归 merge
        if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
            result[key] = deepMerge(targetValue, sourceValue)
            return
        }

        // 其他类型：直接覆盖
        if (sourceValue !== undefined) {
            result[key] = sourceValue
        }
    })

    return result as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]'
}

export function debounce<Args extends unknown[], Result, This = unknown>(
    func: (this: This, ...args: Args) => Result,
    wait: number,
    immediate: boolean = false
): (this: This, ...args: Args) => void {
    let timeoutId: NodeJS.Timeout | null = null
    return function (this: This, ...args: Args) {
        const callNow = immediate && !timeoutId
        
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        
        timeoutId = setTimeout(() => {
            timeoutId = null
            if (!immediate) func.apply(this, args)
        }, wait)
        
        if (callNow) func.apply(this, args)
    }
}
