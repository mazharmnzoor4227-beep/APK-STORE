package com.apkstore.client;

final class UpdateLogic {
    private UpdateLogic() {}
    static boolean available(long installedCode, long publishedCode, boolean ignored, boolean blacklisted) {
        return installedCode >= 0 && publishedCode > installedCode && !ignored && !blacklisted;
    }
}
