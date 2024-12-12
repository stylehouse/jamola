
export function userAgent() {
    console.log("navigator.userAgent",navigator.userAgent)
    return navigator.userAgent.includes('Firefox/') ? 'Firefox'
        : navigator.userAgent.includes('Safari/')
            && !navigator.userAgent.includes('Chrome/') ? 'Safari'
        : 'Chrome'
}