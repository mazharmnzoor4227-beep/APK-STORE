package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

public class UpdateLogicTest {
    @Test public void comparesVersionCodesAndFiltersIgnoredApps() {
        assertTrue(UpdateLogic.available(12, 13, false, false));
        assertFalse(UpdateLogic.available(13, 13, false, false));
        assertFalse(UpdateLogic.available(-1, 13, false, false));
        assertFalse(UpdateLogic.available(12, 13, true, false));
        assertFalse(UpdateLogic.available(12, 13, false, true));
    }
}
