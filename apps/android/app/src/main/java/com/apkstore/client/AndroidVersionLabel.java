package com.apkstore.client;

final class AndroidVersionLabel {
    private AndroidVersionLabel() {}

    static String forMinSdk(int api) {
        if (api <= 0) return "";
        return switch (api) {
            case 1 -> "Android 1.0+";
            case 2 -> "Android 1.1+";
            case 3 -> "Android 1.5+";
            case 4 -> "Android 1.6+";
            case 5 -> "Android 2.0+";
            case 6 -> "Android 2.0.1+";
            case 7 -> "Android 2.1+";
            case 8 -> "Android 2.2+";
            case 9, 10 -> "Android 2.3+";
            case 11, 12, 13 -> "Android 3.x+";
            case 14, 15 -> "Android 4.0+";
            case 16 -> "Android 4.1+";
            case 17 -> "Android 4.2+";
            case 18 -> "Android 4.3+";
            case 19, 20 -> "Android 4.4+";
            case 21 -> "Android 5.0+";
            case 22 -> "Android 5.1+";
            case 23 -> "Android 6.0+";
            case 24 -> "Android 7.0+";
            case 25 -> "Android 7.1+";
            case 26 -> "Android 8.0+";
            case 27 -> "Android 8.1+";
            case 28 -> "Android 9+";
            case 29 -> "Android 10+";
            case 30 -> "Android 11+";
            case 31 -> "Android 12+";
            case 32 -> "Android 12L+";
            case 33 -> "Android 13+";
            case 34 -> "Android 14+";
            case 35 -> "Android 15+";
            case 36 -> "Android 16+";
            default -> "API " + api + "+";
        };
    }
}
